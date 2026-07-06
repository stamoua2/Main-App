import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { classeStatut } from "../statut";

interface Campagne {
  id: number;
  name: string;
  channel: string;
  content: string;
  objective: string;
  tone: string;
  imageData: string;
  launchOn: string | null;
  status: string;
}

const STATUTS = ["planifiée", "lancée", "terminée", "annulée"];
const RESEAUX = ["Facebook", "Instagram", "Google", "Courriel", "Autre"];
const TONS = [
  "chaleureux et professionnel",
  "dynamique et accrocheur",
  "humoristique",
  "informatif et rassurant",
];

const FORM_VIDE = {
  name: "",
  channel: "Facebook",
  objective: "",
  tone: TONS[0],
  details: "",
  content: "",
  imageData: "",
  launchOn: "",
};

export default function Marketing() {
  const [campagnes, setCampagnes] = useState<Campagne[]>([]);
  const [form, setForm] = useState({ ...FORM_VIDE });
  const [generation, setGeneration] = useState<"" | "texte" | "image">("");
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");

  const charger = useCallback(async () => {
    const r = await api.get<{ campagnes: Campagne[] }>("/api/campaigns");
    setCampagnes(r.campagnes);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function generer(mode: "texte" | "image") {
    setErreur("");
    setMessage("");
    setGeneration(mode);
    try {
      const r = await api.post<{ texte?: string; image?: string }>("/api/marketing/generate", {
        mode,
        platform: form.channel,
        objective: form.objective,
        tone: form.tone,
        details: form.details,
      });
      if (mode === "texte" && r.texte) {
        setForm((f) => ({ ...f, content: r.texte! }));
        setMessage("Texte généré — modifiez-le librement avant de sauvegarder.");
      }
      if (mode === "image" && r.image) {
        setForm((f) => ({ ...f, imageData: r.image! }));
        setMessage("Image générée — téléchargez-la ou régénérez-en une autre.");
      }
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Génération impossible.");
    } finally {
      setGeneration("");
    }
  }

  async function sauvegarder(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    setMessage("");
    try {
      await api.post("/api/campaigns", {
        name: form.name,
        channel: form.channel,
        content: form.content,
        objective: form.objective,
        tone: form.tone,
        aiPrompt: form.details,
        imageData: form.imageData,
        launchOn: form.launchOn,
      });
      setForm({ ...FORM_VIDE });
      setMessage("Campagne sauvegardée.");
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur lors de la sauvegarde.");
    }
  }

  async function changerStatut(c: Campagne, status: string) {
    await api.put(`/api/campaigns/${c.id}`, { status });
    await charger();
  }

  async function supprimer(c: Campagne) {
    if (!window.confirm(`Supprimer la campagne « ${c.name} » ?`)) return;
    await api.delete(`/api/campaigns/${c.id}`);
    await charger();
  }

  async function copier(texte: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setMessage("Texte copié — collez-le dans votre annonce.");
    } catch {
      setMessage("Impossible de copier automatiquement — sélectionnez le texte à la main.");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Opérations</div>
          <h1>Marketing</h1>
        </div>
      </div>
      <p style={{ color: "var(--muted)", marginTop: -10 }}>
        Préparez vos annonces (Facebook, Instagram, etc.) en quelques secondes :
        l'IA rédige le texte et génère le visuel, vous ajustez, puis vous copiez le
        tout dans le gestionnaire de publicités du réseau choisi.
      </p>

      <div className="panel">
        <h2>Créer une annonce avec l'IA</h2>
        <form onSubmit={sauvegarder}>
          <div className="form-grid">
            <label className="field">
              Nom de la campagne
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ex. : Promo printemps 2026"
                required
              />
            </label>
            <label className="field">
              Réseau / canal
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                {RESEAUX.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Date de lancement
              <input
                type="date"
                value={form.launchOn}
                onChange={(e) => setForm({ ...form, launchOn: e.target.value })}
                required
              />
            </label>
            <label className="field">
              Objectif de la campagne
              <input
                value={form.objective}
                onChange={(e) => setForm({ ...form, objective: e.target.value })}
                placeholder="ex. : remplir le calendrier de sursemis d'automne"
              />
            </label>
            <label className="field">
              Ton du message
              <select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
                {TONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Détails à intégrer (rabais, dates, secteur…)
              <input
                value={form.details}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
                placeholder="ex. : 15 % de rabais avant le 1er avril"
              />
            </label>
          </div>

          <div className="toolbar" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => generer("texte")}
              disabled={generation !== ""}
            >
              {generation === "texte" ? "Rédaction en cours…" : "Générer le texte (IA)"}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => generer("image")}
              disabled={generation !== ""}
            >
              {generation === "image" ? "Création de l'image…" : "Générer l'image (IA)"}
            </button>
          </div>

          <label className="field" style={{ marginTop: 14 }}>
            Texte de l'annonce (modifiable)
            <textarea
              rows={7}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Cliquez « Générer le texte (IA) » ou rédigez vous-même…"
            />
          </label>

          {form.imageData && (
            <div style={{ marginTop: 14 }}>
              <img
                src={form.imageData}
                alt="Visuel généré pour l'annonce"
                style={{ maxWidth: 380, width: "100%", borderRadius: 12, border: "1px solid var(--border-2)" }}
              />
              <div className="toolbar" style={{ marginTop: 8 }}>
                <a className="btn secondary small" href={form.imageData} download="annonce-st-amour-du-vert.png">
                  Télécharger l'image
                </a>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setForm({ ...form, imageData: "" })}
                >
                  Retirer l'image
                </button>
              </div>
            </div>
          )}

          {erreur && <div className="error-text">{erreur}</div>}
          {message && <div className="ok-text">{message}</div>}
          <button className="btn" type="submit" style={{ marginTop: 14 }}>
            Sauvegarder la campagne
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Campagnes</h2>
        {campagnes.length === 0 ? (
          <div className="empty-state">
            <span className="empty-ico">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 11 18-5v12L3 14v-3z" />
                <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
              </svg>
            </span>
            <p>Aucune campagne. Créez la première ci-dessus !</p>
          </div>
        ) : (
          campagnes.map((c) => (
            <div
              key={c.id}
              style={{
                borderTop: "1px solid var(--border-2)",
                padding: "16px 0",
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              {c.imageData && (
                <img
                  src={c.imageData}
                  alt=""
                  style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 10, flexShrink: 0 }}
                />
              )}
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{c.name}</strong>
                  <span className={classeStatut(c.status)}>{c.status}</span>
                  <span className="chip plain">{c.channel || "—"}</span>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>
                    {c.launchOn ? `lancement le ${c.launchOn}` : ""}
                  </span>
                </div>
                {c.objective && (
                  <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>{c.objective}</div>
                )}
                {c.content && (
                  <p style={{ whiteSpace: "pre-wrap", fontSize: 13.5, margin: "8px 0 0", maxHeight: 120, overflow: "auto" }}>
                    {c.content}
                  </p>
                )}
                <div className="row-actions" style={{ marginTop: 10 }}>
                  {c.content && (
                    <button className="btn secondary small" onClick={() => copier(c.content)}>
                      Copier le texte
                    </button>
                  )}
                  {c.imageData && (
                    <a className="btn secondary small" href={c.imageData} download={`campagne-${c.id}.png`}>
                      Télécharger l'image
                    </a>
                  )}
                  <select value={c.status} onChange={(e) => changerStatut(c, e.target.value)}>
                    {STATUTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button className="btn danger small" onClick={() => supprimer(c)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
