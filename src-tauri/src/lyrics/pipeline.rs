use super::lrc;
use super::model::{
    LyricFormat, LyricsDocument, LyricsLine, LyricsMetadata, LyricsOptions, LyricsPipelineResult,
    LyricsTrack, LyricsWord, TrackType,
};
use super::{processors, ttml};
use regex::Regex;
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::sync::OnceLock;

pub(crate) fn process_text(
    raw: &str,
    options: &LyricsOptions,
) -> Result<LyricsPipelineResult, String> {
    if raw.trim().is_empty() {
        let target_format = options
            .target_format
            .or(options.source_format)
            .unwrap_or(LyricFormat::PlainLrc);
        return Ok(LyricsPipelineResult {
            text: raw.to_string(),
            warnings: Vec::new(),
            source_format: options.source_format,
            target_format,
        });
    }
    let source_format = options.source_format.unwrap_or_else(|| detect_format(raw));
    let target_format = options.target_format.unwrap_or(source_format);
    let mut result = Map::new();
    result.insert(
        raw_key(source_format).to_string(),
        Value::String(raw.to_string()),
    );
    let processed = process_plugin_result(&Value::Object(result), target_format, options)?;
    if !processed.text.is_empty()
        || source_format == LyricFormat::Ttml
        || !options.remove_empty_lines
    {
        return Ok(processed);
    }
    Ok(LyricsPipelineResult {
        text: raw
            .lines()
            .filter(|line| !line.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        ..processed
    })
}

pub(crate) fn process_plugin_result(
    result: &Value,
    target_format: LyricFormat,
    options: &LyricsOptions,
) -> Result<LyricsPipelineResult, String> {
    let mut first_error: Option<String> = None;
    for candidate in plugin_candidates(result) {
        let Some(object) = candidate.as_object() else {
            continue;
        };
        match process_plugin_object(object, target_format, options) {
            Ok(rendered) if !rendered.text.is_empty() => return Ok(rendered),
            Ok(_) => {}
            Err(error) if first_error.is_none() => first_error = Some(error),
            Err(_) => {}
        }
    }
    match first_error {
        Some(error) => Err(error),
        None => Ok(empty_result(target_format)),
    }
}

/// 插件的 `getLyrics` 约定返回歌词候选数组（按匹配度排序），
/// 逐个渲染，取第一个产生内容的候选；单对象结果原样处理。
fn plugin_candidates(result: &Value) -> Vec<&Value> {
    match result {
        Value::Array(items) => items.iter().collect(),
        _ => vec![result],
    }
}

fn process_plugin_object(
    object: &Map<String, Value>,
    target_format: LyricFormat,
    options: &LyricsOptions,
) -> Result<LyricsPipelineResult, String> {
    let target_raw = raw_string(object, raw_keys(target_format));
    if target_raw.is_some_and(|raw| !raw.trim().is_empty())
        && options.show_translation
        && options.show_romanization
        && !options.only_translation_if_available
        && !options.has_document_transforms()
    {
        return Ok(LyricsPipelineResult {
            text: target_raw.unwrap().to_string(),
            warnings: Vec::new(),
            source_format: Some(target_format),
            target_format,
        });
    }

    let document = if is_structured(object) {
        Some(document_from_structured(object)?)
    } else {
        parse_best_raw_document(object, target_format, options)
    };
    let Some(document) = document else {
        return Ok(empty_result(target_format));
    };
    let source_format = document.source_format;
    let processed = processors::process(document, options);
    let text = match target_format {
        LyricFormat::Ttml => ttml::write(&processed),
        _ => lrc::write(&processed, target_format, options),
    };
    Ok(LyricsPipelineResult {
        text,
        warnings: collect_warnings(object, source_format, target_format),
        source_format,
        target_format,
    })
}

fn empty_result(target_format: LyricFormat) -> LyricsPipelineResult {
    LyricsPipelineResult {
        text: String::new(),
        warnings: Vec::new(),
        source_format: None,
        target_format,
    }
}

fn parse_best_raw_document(
    object: &Map<String, Value>,
    target_format: LyricFormat,
    options: &LyricsOptions,
) -> Option<LyricsDocument> {
    // 多人增强歌词（MPE）带逐字时间与演唱者标记，可无损转为增强 LRC
    for key in MULTI_PERSON_ENHANCED_RAW_KEYS {
        let Some(raw) = object.get(*key).and_then(Value::as_str) else {
            continue;
        };
        if raw.trim().is_empty() {
            continue;
        }
        let parsed = parse_document(raw, LyricFormat::EnhancedLrc);
        if parsed.tracks.iter().any(|track| !track.lines.is_empty()) {
            return Some(parsed);
        }
    }
    let mut order = Vec::new();
    push_unique(&mut order, target_format);
    if options.show_translation
        || options.show_romanization
        || options.only_translation_if_available
    {
        push_unique(&mut order, LyricFormat::Ttml);
    }
    push_unique(&mut order, LyricFormat::EnhancedLrc);
    push_unique(&mut order, LyricFormat::VerbatimLrc);
    push_unique(&mut order, LyricFormat::PlainLrc);
    push_unique(&mut order, LyricFormat::Ttml);
    for source_format in order {
        let Some(raw) = raw_string(object, raw_keys(source_format)) else {
            continue;
        };
        if raw.trim().is_empty() {
            continue;
        }
        let parsed = parse_document(raw, source_format);
        if parsed.tracks.iter().any(|track| !track.lines.is_empty()) {
            return Some(parsed);
        }
    }
    None
}

fn push_unique(order: &mut Vec<LyricFormat>, format: LyricFormat) {
    if !order.contains(&format) {
        order.push(format);
    }
}

fn parse_document(raw: &str, format: LyricFormat) -> LyricsDocument {
    if format == LyricFormat::Ttml {
        ttml::parse(raw)
    } else {
        lrc::parse(raw, format)
    }
}

fn document_from_structured(object: &Map<String, Value>) -> Result<LyricsDocument, String> {
    let original = compact_lines(object.get("original"), TrackType::Original)?;
    let mut tracks = vec![LyricsTrack::new(TrackType::Original, original)];
    let translated = compact_lines(object.get("translated"), TrackType::Translation)?;
    if !translated.is_empty() {
        tracks.push(LyricsTrack::new(TrackType::Translation, translated));
    }
    let romanization = compact_lines(object.get("romanization"), TrackType::Romanization)?;
    if !romanization.is_empty() {
        tracks.push(LyricsTrack::new(TrackType::Romanization, romanization));
    }
    let tags = object
        .get("tags")
        .and_then(Value::as_object)
        .map(|tags| {
            tags.iter()
                .filter_map(|(key, value)| {
                    if value.is_null() {
                        return None;
                    }
                    let value = value
                        .as_str()
                        .map(str::to_string)
                        .unwrap_or_else(|| value.to_string());
                    (!value.trim().is_empty()).then(|| (key.clone(), value))
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(LyricsDocument {
        metadata: LyricsMetadata::from_lrc_tags(tags),
        agents: Vec::new(),
        tracks,
        source_format: None,
    })
}

fn compact_lines(value: Option<&Value>, kind: TrackType) -> Result<Vec<LyricsLine>, String> {
    let Some(lines) = value.and_then(Value::as_array) else {
        return Ok(Vec::new());
    };
    lines
        .iter()
        .enumerate()
        .map(|(index, line)| compact_line(line, index, kind))
        .collect()
}

fn compact_line(value: &Value, index: usize, kind: TrackType) -> Result<LyricsLine, String> {
    let items = value
        .as_array()
        .ok_or_else(|| "Structured lyric line must be an array".to_string())?;
    if items.len() < 3 {
        return Err("Structured lyric line must have start, end and text".to_string());
    }
    let start_ms = number_to_i64(&items[0]);
    let end_ms = number_to_i64(&items[1]);
    let mut words = Vec::new();
    let text = if let Some(compact_words) = items[2].as_array() {
        for compact in compact_words {
            let word = compact
                .as_array()
                .ok_or_else(|| "Structured lyric word must be an array".to_string())?;
            if word.len() < 3 {
                return Err("Structured lyric word must have start, end and text".to_string());
            }
            words.push(LyricsWord {
                start_ms: number_to_i64(&word[0]),
                end_ms: number_to_i64(&word[1]),
                text: value_to_text(&word[2]),
            });
        }
        words.iter().map(|word| word.text.as_str()).collect()
    } else {
        value_to_text(&items[2])
    };
    if kind != TrackType::Original {
        words.clear();
    }
    Ok(LyricsLine {
        start_ms,
        end_ms,
        text,
        words,
        link_key: Some(format!("L{}", index + 1)),
        agent_id: None,
    })
}

fn number_to_i64(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_f64().map(|value| value.round() as i64))
}

fn value_to_text(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn is_structured(object: &Map<String, Value>) -> bool {
    object.get("original").is_some_and(Value::is_array)
}

fn raw_key(format: LyricFormat) -> &'static str {
    match format {
        LyricFormat::PlainLrc => "rawPlainLrc",
        LyricFormat::VerbatimLrc => "rawVerbatimLrc",
        LyricFormat::EnhancedLrc => "rawEnhancedLrc",
        LyricFormat::Ttml => "rawTtml",
    }
}

const MULTI_PERSON_ENHANCED_RAW_KEYS: &[&str] = &[
    "rawMultiPersonEnhancedLrc",
    "raw_multi_person_enhanced_lrc",
];

fn raw_keys(format: LyricFormat) -> &'static [&'static str] {
    match format {
        LyricFormat::PlainLrc => &["rawPlainLrc", "raw_plain_lrc"],
        LyricFormat::VerbatimLrc => &["rawVerbatimLrc", "raw_verbatim_lrc"],
        LyricFormat::EnhancedLrc => &["rawEnhancedLrc", "raw_enhanced_lrc"],
        LyricFormat::Ttml => &["rawTtml", "raw_ttml"],
    }
}

fn raw_string<'a>(object: &'a Map<String, Value>, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| object.get(*key).and_then(Value::as_str))
}

pub(crate) fn detect_format(raw: &str) -> LyricFormat {
    static TTML: OnceLock<Regex> = OnceLock::new();
    static ENHANCED: OnceLock<Regex> = OnceLock::new();
    static VERBATIM: OnceLock<Regex> = OnceLock::new();
    if TTML
        .get_or_init(|| {
            Regex::new(r"(?i)<(?:\w+:)?tt(?:\s|>)|<(?:\w+:)?p\b[^>]*(?:begin|end)=")
                .expect("valid TTML detection regex")
        })
        .is_match(raw)
    {
        return LyricFormat::Ttml;
    }
    if ENHANCED
        .get_or_init(|| {
            Regex::new(r"<\d{1,3}:\d{2}(?:[.:]\d{1,3})?(?:\|[^<>]*)?>")
                .expect("valid enhanced LRC detection regex")
        })
        .is_match(raw)
    {
        return LyricFormat::EnhancedLrc;
    }
    if VERBATIM
        .get_or_init(|| {
            Regex::new(r"(?m)^\s*(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\].*){2,}")
                .expect("valid verbatim LRC detection regex")
        })
        .is_match(raw)
    {
        return LyricFormat::VerbatimLrc;
    }
    LyricFormat::PlainLrc
}

pub(crate) fn extract_plain_text(raw: &str) -> String {
    if raw.trim().is_empty() {
        return String::new();
    }
    let format = detect_format(raw);
    let document = parse_document(raw, format);
    let lines: Vec<_> = document
        .tracks
        .iter()
        .find(|track| track.kind == TrackType::Original)
        .map(|track| {
            track
                .lines
                .iter()
                .map(LyricsLine::visible_text)
                .filter(|line| !line.is_empty())
                .collect()
        })
        .unwrap_or_default();
    if !lines.is_empty() {
        return lines.join("\n");
    }
    raw.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn collect_warnings(
    object: &Map<String, Value>,
    source_format: Option<LyricFormat>,
    target_format: LyricFormat,
) -> Vec<String> {
    if source_format != Some(LyricFormat::Ttml) || target_format == LyricFormat::Ttml {
        return Vec::new();
    }
    let Some(raw) = object.get("rawTtml").and_then(Value::as_str) else {
        return Vec::new();
    };
    let known: HashSet<_> = [
        "http://www.w3.org/ns/ttml",
        "http://www.w3.org/ns/ttml#metadata",
        "http://music.apple.com/lyric-ttml-internal",
    ]
    .into_iter()
    .collect();
    let pattern =
        Regex::new(r#"xmlns(?::[\w-]+)?=["']([^"']+)["']"#).expect("valid namespace regex");
    let mut unknown = Vec::new();
    for namespace in pattern
        .captures_iter(raw)
        .filter_map(|capture| capture.get(1).map(|value| value.as_str()))
    {
        if !known.contains(namespace) && !unknown.contains(&namespace) {
            unknown.push(namespace);
        }
    }
    unknown
        .into_iter()
        .map(|namespace| {
            format!(
                "TTML extension cannot be represented in {}: {namespace}",
                target_format.as_str()
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use serde_json::json;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FixtureExpectation {
        text: Option<String>,
        #[serde(default)]
        contains: Vec<String>,
        #[serde(default)]
        not_contains: Vec<String>,
        warnings: Vec<String>,
        source_format: Option<LyricFormat>,
        target_format: LyricFormat,
        same_timestamp_lines: Option<TimestampLines>,
    }

    #[derive(Deserialize)]
    struct TimestampLines {
        timestamp: String,
        lines: Vec<String>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FixtureCase {
        name: String,
        operation: String,
        result: Option<Value>,
        raw: Option<String>,
        target_format: Option<LyricFormat>,
        options: LyricsOptions,
        expect: FixtureExpectation,
    }

    #[test]
    fn rust_pipeline_matches_shared_mobile_fixtures() {
        let fixtures: Vec<FixtureCase> = serde_json::from_str(include_str!(
            "../../../src/domain/fixtures/lyricsPipelineCases.json"
        ))
        .expect("shared lyric fixtures should parse");
        for fixture in fixtures {
            let result = if fixture.operation == "text" {
                process_text(fixture.raw.as_deref().unwrap_or_default(), &fixture.options)
            } else {
                process_plugin_result(
                    fixture.result.as_ref().unwrap_or(&Value::Null),
                    fixture.target_format.expect("plugin fixture target format"),
                    &fixture.options,
                )
            }
            .unwrap_or_else(|error| panic!("{}: {error}", fixture.name));
            if let Some(expected) = fixture.expect.text {
                assert_eq!(result.text, expected, "{} text", fixture.name);
            }
            for expected in fixture.expect.contains {
                assert!(
                    result.text.contains(&expected),
                    "{} should contain {expected:?}\n{}",
                    fixture.name,
                    result.text
                );
            }
            for expected in fixture.expect.not_contains {
                assert!(
                    !result.text.contains(&expected),
                    "{} should not contain {expected:?}\n{}",
                    fixture.name,
                    result.text
                );
            }
            if let Some(expected) = fixture.expect.same_timestamp_lines {
                let lines: Vec<_> = result
                    .text
                    .lines()
                    .filter(|line| line.starts_with(&expected.timestamp))
                    .map(str::to_string)
                    .collect();
                assert_eq!(lines, expected.lines, "{} line order", fixture.name);
            }
            assert_eq!(
                result.warnings, fixture.expect.warnings,
                "{} warnings",
                fixture.name
            );
            assert_eq!(
                result.source_format, fixture.expect.source_format,
                "{} source format",
                fixture.name
            );
            assert_eq!(
                result.target_format, fixture.expect.target_format,
                "{} target format",
                fixture.name
            );
        }
    }

    #[test]
    fn detects_export_format_and_extracts_original_plain_text() {
        assert_eq!(
            detect_format("<tt><body><p begin=\"1s\">line</p></body></tt>"),
            LyricFormat::Ttml
        );
        assert_eq!(
            detect_format("[00:01.000]<00:01.000>word"),
            LyricFormat::EnhancedLrc
        );
        assert_eq!(
            detect_format("[00:11.00]<00:11.00|张三>天<00:12.00>"),
            LyricFormat::EnhancedLrc
        );
        assert_eq!(
            extract_plain_text("[00:01.000]hello\n[00:02.000]world"),
            "hello\nworld"
        );
    }

    #[test]
    fn plugin_candidate_array_renders_first_usable_lyrics() {
        let candidates = json!([
            { "type": "structured", "original": [[1000, 2000, [[1000, 1500, "这"], [1500, 2000, "里"]]]] },
            { "type": "structured", "original": [[1000, 2000, "fallback"]] }
        ]);
        let result = process_plugin_result(
            &candidates,
            LyricFormat::PlainLrc,
            &LyricsOptions::default(),
        )
        .expect("first candidate should render");
        assert_eq!(result.text, "[00:01.000]这里");
    }

    #[test]
    fn plugin_candidate_array_skips_empty_then_uses_fallback() {
        let candidates = json!([
            null,
            { "type": "structured", "original": [] },
            { "type": "structured", "original": [[1000, 2000, "fallback"]] }
        ]);
        let result = process_plugin_result(
            &candidates,
            LyricFormat::PlainLrc,
            &LyricsOptions::default(),
        )
        .expect("fallback candidate should render");
        assert_eq!(result.text, "[00:01.000]fallback");
    }

    #[test]
    fn plugin_candidate_array_propagates_error_when_all_fail() {
        let candidates = json!([
            { "type": "structured", "original": [[1000, "missing end and text"]] }
        ]);
        let error = process_plugin_result(
            &candidates,
            LyricFormat::PlainLrc,
            &LyricsOptions::default(),
        )
        .expect_err("malformed candidate should error");
        assert!(error.contains("Structured lyric line"));
    }

    #[test]
    fn plugin_candidate_array_of_nulls_returns_empty() {
        let candidates = json!([null, null]);
        let result = process_plugin_result(
            &candidates,
            LyricFormat::PlainLrc,
            &LyricsOptions::default(),
        )
        .expect("empty array should not error");
        assert!(result.text.is_empty());
    }

    #[test]
    fn renders_multi_person_enhanced_lrc_as_word_timed_lyrics() {
        let candidate = json!({
            "type": "rawMultiPersonEnhancedLrc",
            "tags": { "ti": "晴天", "ar": "周杰伦" },
            "rawMultiPersonEnhancedLrc":
                "[00:11.00]<00:11.00|张三>天<00:12.00|李四>空<00:13.00>"
        });
        let result = process_plugin_result(&candidate, LyricFormat::EnhancedLrc, &LyricsOptions::default())
            .expect("MPE should render as enhanced LRC");
        assert_eq!(result.text, "[00:11.000]<00:11.000>天<00:12.000>空<00:13.000>");
    }

    #[test]
    fn renders_snake_case_raw_keys() {
        let candidate = json!({
            "type": "rawPlainLrc",
            "tags": { "ti": "晴天" },
            "raw_plain_lrc": "[00:01.000]hello\n[00:02.000]world"
        });
        let result = process_plugin_result(&candidate, LyricFormat::PlainLrc, &LyricsOptions::default())
            .expect("snake_case raw key should render");
        assert_eq!(result.text, "[00:01.000]hello\n[00:02.000]world");
    }
}
