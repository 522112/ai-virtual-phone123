"use client";

import { RELATIONSHIP_KIND_META, RELATIONSHIP_KINDS, type RelationshipKind } from "@/lib/relationship-types";
import { RelationshipKindIcon } from "@/components/chat/relationship-kind-icon";

export function RelationshipInviteModal({
  characterName,
  onClose,
  onConfirm,
}: {
  characterName: string;
  onClose: () => void;
  onConfirm: (kind: RelationshipKind) => void;
}) {
  return (
    <div className="rel-invite-overlay" role="dialog" aria-modal="true" aria-label="关系邀约">
      <button type="button" className="rel-invite-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="rel-invite-sheet">
        <div className="rel-invite-handle" />
        <div className="rel-invite-head">
          <h3>邀请 {characterName}</h3>
          <p>选择一段关系，对方收到待接收卡片后才能进入双方空间。同一角色同时只能有一份关系申请。</p>
        </div>
        <div className="rel-invite-grid">
          {RELATIONSHIP_KINDS.map(kind => {
            const meta = RELATIONSHIP_KIND_META[kind];
            return (
              <button
                key={kind}
                type="button"
                className="rel-invite-tile"
                style={{ "--rel-accent": meta.accent } as React.CSSProperties}
                onClick={() => onConfirm(kind)}
              >
                <span className="rel-invite-mark">
                  <RelationshipKindIcon kind={kind} />
                </span>
                <span className="rel-invite-label">{meta.label}</span>
                <span className="rel-invite-hint">{meta.inviteHint}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="rel-invite-cancel" onClick={onClose}>取消</button>
      </div>
    </div>
  );
}
