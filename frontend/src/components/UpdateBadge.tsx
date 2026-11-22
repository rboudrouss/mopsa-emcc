import { RefreshCwIcon } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

// How often an open page looks for a new version (also at each load)
const CHECK_EVERY = 60 * 60 * 1000;

/**
 * The top bar's sign of a new version of the site: the service worker has
 * it in its cache, and a click reloads the page with it. Until then, the
 * page and its reloads keep the version they started with.
 */
export function UpdateBadge({ compact }: { compact?: boolean }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_, r) {
      if (r) setInterval(() => r.update().catch(() => {}), CHECK_EVERY);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="update-badge">
      <button
        onClick={() => updateServiceWorker(true)}
        title="A new version of the site is ready: reload the page to use it"
      >
        <RefreshCwIcon size={13} />{" "}
        {compact ? "Update" : "New version · Reload"}
      </button>
    </div>
  );
}
