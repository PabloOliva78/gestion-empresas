// Abre Dynamics 365 desde la app. D365 solo admite enlaces con el filtro cifrado (los genera él), así que no se puede abrir «el proveedor X» directamente:
// se abre la pantalla de transacciones de la empresa y la cuenta queda copiada en el portapapeles para pegarla (Ctrl+V) en el filtro «Cuenta de proveedor / cliente».
const ERP = 'https://herogra.operations.dynamics.com/';
export function abrirD365({ tipo = 'prov', cuenta, siglas }) {
  const c = String(cuenta ?? '').trim(); if (!c) return;
  const cmp = encodeURIComponent(String(siglas || 'HER').toUpperCase());
  window.open(`${ERP}?cmp=${cmp}&mi=${tipo === 'prov' ? 'VendTrans' : 'CustTrans'}`, '_blank', 'noopener');
  const aviso = (t) => {
    const d = Object.assign(document.createElement('div'), { className: 'no-print', textContent: t });
    d.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99999;background:#1d1d1f;color:#fff;padding:10px 16px;border-radius:12px;font:13px system-ui;box-shadow:0 6px 20px rgba(0,0,0,.3)';
    document.body.appendChild(d); setTimeout(() => d.remove(), 6000);
  };
  const quien = tipo === 'prov' ? 'proveedor' : 'cliente';
  (navigator.clipboard?.writeText(c) ?? Promise.reject()).then(() => aviso(`Cuenta de ${quien} ${c} copiada: pégala (Ctrl+V) en el filtro de D365.`), () => aviso(`Cuenta de ${quien}: ${c} (no se pudo copiar; escríbela en el filtro de D365).`));
}
