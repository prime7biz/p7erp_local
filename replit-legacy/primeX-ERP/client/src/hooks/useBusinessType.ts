import { useAuth } from "./useAuth";

export function useBusinessType() {
  const { user } = useAuth();
  const businessType = user?.tenant?.businessType || 'both';

  return {
    businessType,
    isBuyingHouse: businessType === 'buying_house' || businessType === 'both',
    isManufacturer: businessType === 'manufacturer' || businessType === 'both',
    isBoth: businessType === 'both',
  };
}
