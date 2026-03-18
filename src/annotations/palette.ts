export const annotationColor = (kind: string): string => {
  const m: Record<string, string> = {
    source: "#f59e0b",
    stopHunt: "#ef4444",
    point1: "#22c55e",
    point2: "#14b8a6",
    point3: "#0ea5e9",
    node1: "#22c55e",
    node2: "#14b8a6",
    node3: "#0ea5e9",
    breakout: "#8b5cf6",
    emaConfirm: "#a855f7",
    entry: "#4f46e5",
    stop: "#dc2626",
    tp30: "#16a34a",
    tp35: "#15803d",
    tp40: "#166534",
    tp50: "#14532d",
  };
  return m[kind] || "#111827";
};
