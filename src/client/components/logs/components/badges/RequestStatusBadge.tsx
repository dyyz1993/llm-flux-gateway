import React from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface RequestStatusBadgeProps {
  statusCode: number;
}

/**
 * Badge indicating the status of a request (Requesting, Success, Error)
 */
export const RequestStatusBadge: React.FC<RequestStatusBadgeProps> = ({ statusCode }) => {
  if (statusCode === 0) {
    return (
      <span
        data-class-id="RequestStatusBadge-Requesting"
        className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1 font-medium animate-pulse"
      >
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        Requesting
      </span>
    );
  }

  if (statusCode >= 200 && statusCode < 300) {
    return (
      <span
        data-class-id="RequestStatusBadge-Success"
        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-medium"
      >
        <CheckCircle className="w-2.5 h-2.5" />
        {statusCode}
      </span>
    );
  }

  return (
    <span
      data-class-id="RequestStatusBadge-Error"
      className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1 font-medium"
    >
      <XCircle className="w-2.5 h-2.5" />
      {statusCode === 0 ? 'Error' : statusCode}
    </span>
  );
};
