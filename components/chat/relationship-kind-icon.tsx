"use client";

import type { RelationshipKind } from "@/lib/relationship-types";

export function RelationshipKindIcon({
  kind,
  size = "md",
}: {
  kind: RelationshipKind;
  size?: "sm" | "md" | "lg";
}) {
  return <span className="rel-kind-icon" data-kind={kind} data-size={size} aria-hidden />;
}
