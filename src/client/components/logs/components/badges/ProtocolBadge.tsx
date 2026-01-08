import React from 'react';
import { ApiFormat } from '@server/module-protocol-transpiler';
import { getProtocolInfo } from '../../utils/logHelpers';

interface ProtocolBadgeProps {
  format: ApiFormat | undefined;
}

export const ProtocolBadge: React.FC<ProtocolBadgeProps> = ({ format }) => {
  if (!format) return null;

  const info = getProtocolInfo(format);
  if (!info) return null;

  return (
    <span
      data-class-id="ProtocolBadge"
      className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase border ${info.bgColor} ${info.textColor} ${info.borderColor}`}
      title={`Protocol: ${info.displayName}`}
    >
      {format}
    </span>
  );
};
