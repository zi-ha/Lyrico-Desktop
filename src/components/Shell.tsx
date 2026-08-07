import {
  CustomerServiceOutlined,
  SettingOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { Button, Flex, Layout, Menu, Progress, Tooltip, Typography, type MenuProps } from "antd";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryFolder, ReplayGainProgress, ViewKey } from "../app/types";
import { useReplayGainProgress } from "../hooks/useReplayGainProgress";

const { Sider, Content } = Layout;
const { Text } = Typography;

export function Shell({
  activeView,
  children,
  folders,
  trackCount,
  onChangeView,
  onCancelReplayGain,
}: {
  activeView: ViewKey;
  children: ReactNode;
  folders: LibraryFolder[];
  trackCount: number;
  onChangeView: (view: ViewKey) => void;
  onCancelReplayGain: () => void;
}) {
  const { t } = useTranslation();
  const replayGainProgress = useReplayGainProgress();
  const navigationItems: MenuProps["items"] = [
    {
      type: "group",
      label: t("nav.library"),
      children: [
        { key: "library", icon: <CustomerServiceOutlined />, label: t("common.songs") },
      ],
    },
    {
      type: "group",
      label: t("nav.tools"),
      children: [
        { key: "tools", icon: <TagsOutlined />, label: t("common.tools") },
      ],
    },
  ];

  return (
    <Layout className="app-shell">
      <Sider
        className="side-panel"
        width={180}
        trigger={null}
      >
        <nav className="side-navigation" aria-label={t("nav.primary")}>
          <Menu
            mode="inline"
            selectedKeys={activeView === "settings" ? [] : [activeView]}
            items={navigationItems}
            onSelect={({ key }) => onChangeView(key as ViewKey)}
          />
        </nav>

        <div className="side-footer">
          <div className="side-library-summary">
            <Text type="secondary">{t("nav.librarySummary", { tracks: trackCount, folders: folders.length })}</Text>
          </div>
          <Tooltip title={t("common.settings")} placement="right">
            <Button
              type="text"
              aria-label={t("common.settings")}
              className={`side-action-button side-settings-button${activeView === "settings" ? " is-active" : ""}`}
              icon={<SettingOutlined />}
              onClick={() => onChangeView("settings")}
            >
              <span className="side-action-text">{t("common.settings")}</span>
            </Button>
          </Tooltip>
        </div>
      </Sider>

      <Layout className="app-main">
        {replayGainProgress?.status === "running" && <GlobalReplayGainProgress progress={replayGainProgress} onCancel={onCancelReplayGain} />}
        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  );
}

function GlobalReplayGainProgress({ progress, onCancel }: { progress: ReplayGainProgress; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="global-scan-progress">
      <Flex justify="space-between" align="center" gap={12}>
        <Text strong>{t("replayGain.analyzing")}</Text>
        <Text type="secondary" ellipsis={{ tooltip: progress.path }}>{progress.path}</Text>
        <Text type="secondary">{progress.percent}%</Text>
        <Button size="small" danger onClick={onCancel}>{t("common.cancel")}</Button>
      </Flex>
      <Progress percent={progress.percent} showInfo={false} size="small" status="active" />
    </div>
  );
}

