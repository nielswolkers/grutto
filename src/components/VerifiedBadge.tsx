import verifiedBadge from "@/assets/verified-badge.png";

interface VerifiedBadgeProps {
  className?: string;
}

export function VerifiedBadge({ className = "" }: VerifiedBadgeProps) {
  return (
    <img
      src={verifiedBadge}
      alt="Geverifieerd"
      className={`inline-block w-5 h-5 ml-1 ${className}`}
      title="Geverifieerd account"
    />
  );
}
