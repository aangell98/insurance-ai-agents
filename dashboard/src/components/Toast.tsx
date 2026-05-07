import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import type { SecurityIncident } from '../api';

interface ToastProps {
  incident: SecurityIncident;
  onClose: () => void;
  onClick?: () => void;
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  critical: { bg: 'bg-red-950/95', border: 'border-red-700', text: 'text-red-100', icon: 'text-red-400' },
  high:     { bg: 'bg-orange-950/95', border: 'border-orange-700', text: 'text-orange-100', icon: 'text-orange-400' },
  medium:   { bg: 'bg-yellow-950/95', border: 'border-yellow-700', text: 'text-yellow-100', icon: 'text-yellow-400' },
  low:      { bg: 'bg-blue-950/95', border: 'border-blue-700', text: 'text-blue-100', icon: 'text-blue-400' },
};

const TYPE_LABEL: Record<string, string> = {
  prompt_injection: 'Intento de manipulación',
  fraud_suspected: 'Posible fraude detectado',
};

export default function Toast({ incident, onClose, onClick }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // animate in
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const handleClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setClosing(true);
    setTimeout(onClose, 300);
  };

  const style = SEVERITY_STYLES[incident.severity] ?? SEVERITY_STYLES.medium;
  const isInjection = incident.incident_type === 'prompt_injection';
  const Icon = isInjection ? ShieldAlert : AlertTriangle;
  const label = TYPE_LABEL[incident.incident_type] ?? incident.incident_type;

  return (
    <div
      onClick={onClick}
      className={`
        ${style.bg} ${style.border} ${style.text}
        border rounded-lg shadow-2xl backdrop-blur-sm
        w-80 p-4 cursor-pointer
        transform transition-all duration-300 ease-out
        ${visible && !closing ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 ${style.icon} animate-pulse`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-sm font-mono text-white/90 mb-1">{incident.claim_id}</p>
          <p className="text-xs leading-snug opacity-90 line-clamp-2">{incident.description}</p>
          <p className="text-[10px] mt-2 opacity-60">Click para ver en Seguridad →</p>
        </div>
      </div>
    </div>
  );
}
