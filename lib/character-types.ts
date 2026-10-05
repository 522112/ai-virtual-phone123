export type Character = {
  id: string;
  name: string;
  avatar: string | null; // data URL 或外部 URL
  persona: string;       // 人设
  briefPersona?: string; // 简量版人设：注入到同世界有关系角色的「角色关系」marker，供对方了解 TA（防 OOC）
  briefPersonaUpdatedAt?: string; // 简介生成时间；早于 updatedAt 时编辑器提示「设定已更新，建议重新生成」
  wechatID?: string;     // 手机号格式的微信号
  screenName?: string;     // 网名：档案页填写/AI 生成，个人主页与名片优先显示
  momentsCover?: string; // 个人主页朋友圈封面（data URL / URL）；空则按人设派生
  pinnedMomentId?: string; // 个人主页朋友圈置顶动态 id；空则按人设自动挑选
  personality?: string;    // 角色性格
  timeZone?: string;       // IANA 时区，例如 America/New_York；空值表示跟随系统时间
  tags?: string[];
  createdAt: string;
  updatedAt: string;

  // 画布坐标与渲染属性
  canvasX?: number;
  canvasY?: number;
  canvasRot?: number;
  canvasZIndex?: number;
  polaroidStyle?: number; // 用户选择的拍立得样式索引
  polaroidSize?: "random" | "small" | "medium" | "large";
  polaroidImageX?: number;
  polaroidImageY?: number;
  polaroidImageZoom?: number;
};

export type CanvasBgItem = {
  id: string;
  type: 'a4' | 'yellow-note' | 'blue-note' | 'torn' | 'grid' | 'scrap';
  x: number;
  y: number;
  rot: number;
  zIndex: number;
  worldId?: string; // 所属世界画布；缺省 = 默认世界（存量数据零迁移）
};
