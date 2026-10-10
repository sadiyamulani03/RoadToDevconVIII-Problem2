"use client";

export type BannerTone = "info" | "ok" | "warn" | "err";

export function StatusBanner({
  tone,
  children,
}: {
  tone: BannerTone;
  children: React.ReactNode;
}) {
  return (
    <div className={`status status-${tone}`} role={tone === "err" ? "alert" : "status"}>
      {children}
    </div>
  );
}
