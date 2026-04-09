import type { ExternalMeResponse } from "./externalAccess";

/** Passed from portal layouts to child routes via `<Outlet context={...} />`. */
export type PortalOutletContext = { me: ExternalMeResponse };
