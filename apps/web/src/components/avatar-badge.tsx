export function AvatarBadge({ name, size = 28 }: { name: string; size?: number }) {
  const initial = (name || "?").trim().charAt(0);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-app-primary font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.43) }}
    >
      {initial}
    </span>
  );
}
