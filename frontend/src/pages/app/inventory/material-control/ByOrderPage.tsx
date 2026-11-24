import { Link } from "react-router-dom";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";

/** Phase 1 placeholder: deep order material views arrive with later phases. */
export function ByOrderPage() {
  const embedded = useEmbeddedPage();
  return (
    <div className="space-y-3">
      {!embedded ? <AppPageHeader title="By order" description="Order-centric material links" /> : null}
      <p className="text-sm text-text-secondary">
        Open an order from the Style control sheet, or use the existing material issue and purchase screens.
      </p>
      <ul className="list-inside list-disc space-y-1 text-sm text-brand-primary">
        <li>
          <Link to="/app/orders" className="hover:underline">
            Orders
          </Link>
        </li>
        <li>
          <Link to="/app/inventory/purchase-orders" className="hover:underline">
            Purchase orders
          </Link>
        </li>
        <li>
          <Link to="/app/inventory/consumption-control" className="hover:underline">
            Consumption control / material issues
          </Link>
        </li>
      </ul>
    </div>
  );
}
