import { DeleteOutlined, FolderAddOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Card, Empty, Flex, List, Popconfirm, Space, Tag, Tooltip, Typography } from "antd";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryFolder } from "../app/types";
import { formatDateTime } from "../utils/format";

const { Title, Text } = Typography;

export const FoldersPage = memo(function FoldersPage({
  folders,
  loading,
  onAddFolders,
  onRescanFolder,
  onRemoveFolder,
}: {
  folders: LibraryFolder[];
  loading: boolean;
  onAddFolders: () => void;
  onRescanFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="workspace page-stack">
      <Flex className="folder-page-header" justify="space-between" align="center" gap={16} wrap>
        <div>
          <Title level={2}>{t("folders.title")}</Title>
          <Text type="secondary">{t("folders.description")}</Text>
        </div>
        <Button type="primary" icon={<FolderAddOutlined />} onClick={onAddFolders}>{t("folders.add")}</Button>
      </Flex>

      {folders.length === 0 && !loading ? (
        <Card>
          <Empty className="page-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("folders.empty")}>
            <Button type="primary" icon={<FolderAddOutlined />} onClick={onAddFolders}>{t("folders.add")}</Button>
          </Empty>
        </Card>
      ) : (
        <Card
          loading={loading && folders.length === 0}
          title={t("folders.libraryRoots")}
          extra={<Tag bordered={false}>{folders.length}</Tag>}
        >
          <List
            dataSource={folders}
            rowKey="path"
            renderItem={(folder) => (
              <List.Item
                actions={[
                  <Tooltip key="rescan" title={t("folders.rescan")}>
                    <Button
                      type="text"
                      icon={<ReloadOutlined />}
                      aria-label={t("folders.rescan")}
                      disabled={folder.status === "scanning"}
                      onClick={() => onRescanFolder(folder.path)}
                    />
                  </Tooltip>,
                  <Popconfirm key="remove" title={t("folders.removeConfirm")} okButtonProps={{ danger: true }} onConfirm={() => onRemoveFolder(folder.path)}>
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label={t("folders.remove")} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={<Text ellipsis className="folder-list-path">{folder.path}</Text>}
                  description={
                    <Space size={12} wrap>
                      <Tag bordered={false}>{t("common.trackCount", { count: folder.trackCount })}</Tag>
                      <Tag color={folder.status === "ready" ? "success" : folder.status === "scanning" ? "processing" : "error"}>
                        {t(`folders.status.${folder.status}`)}
                      </Tag>
                      <Text type="secondary">{t("folders.lastScanValue", { value: formatDateTime(folder.lastScannedAt) })}</Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
});
