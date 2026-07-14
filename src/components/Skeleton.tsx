// Squelette de chargement : remplace le « Chargement… » brut par des barres
// animées, pour un ressenti plus soigné pendant les requêtes.

export function SkeletonTable({ lignes = 5, colonnes = 4 }: { lignes?: number; colonnes?: number }) {
  return (
    <table className="data skeleton-table" aria-hidden="true">
      <tbody>
        {Array.from({ length: lignes }).map((_, i) => (
          <tr key={i}>
            {Array.from({ length: colonnes }).map((__, j) => (
              <td key={j}>
                <span className="skeleton-bar" style={{ width: `${55 + ((i + j) % 4) * 12}%` }} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SkeletonStats({ n = 6 }: { n?: number }) {
  return (
    <div className="grid cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div className="panel stat" key={i}>
          <span className="skeleton-bar" style={{ width: "50%", height: 12 }} />
          <span className="skeleton-bar" style={{ width: "35%", height: 26, marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}
