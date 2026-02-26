import React, { useMemo } from 'react';
import { Vendor } from '@shared/types';
import { findVendorByModel } from '../../utils/logHelpers';

interface VendorBadgeProps {
  modelName?: string;
  vendors: Vendor[];
}

export const VendorBadge: React.FC<VendorBadgeProps> = ({ modelName, vendors }) => {
  const vendor = useMemo(() => findVendorByModel(modelName || '', vendors), [modelName, vendors]);

  if (!vendor) return null;

  return (
    <span
      data-class-id="VendorBadge"
      className="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-1 max-w-[150px]"
      style={{
        backgroundColor: '#1a1a1a',
        borderColor: '#404040',
        color: '#e5e5e5',
      }}
      title={`Vendor: ${vendor.displayName || vendor.name}`}
    >
      {vendor.iconUrl && (
        <img src={vendor.iconUrl} className="w-3 h-3 flex-shrink-0" alt={vendor.name} />
      )}
      <span className="font-medium truncate">{vendor.displayName || vendor.name}</span>
    </span>
  );
};
