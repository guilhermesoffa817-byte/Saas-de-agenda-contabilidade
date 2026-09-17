import { ImageResponse } from "next/og";

export const alt = "Alicerce — agenda e financeiro do seu negócio em um só lugar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Imagem que aparece quando alguém compartilha o link no WhatsApp ou no
 * Instagram. Usa as cores da marca (papel, verde institucional e dourado).
 */
export default async function ImagemSocial() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FBF9F4",
          color: "#1C1F1D",
          padding: 72,
          position: "relative",
        }}
      >
        {/* Grade de papel, bem discreta */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(to right, rgba(28,31,29,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(28,31,29,0.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "#0F3D2E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FBF9F4",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            A
          </div>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>Alicerce</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            Sua agenda cheia.
            <br />
            Seu financeiro em ordem.
          </span>
          <span style={{ fontSize: 28, color: "#5B605B", lineHeight: 1.35, maxWidth: 900 }}>
            Agenda online, financeiro sem planilha e relatório pronto para o seu contador.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              background: "#0F3D2E",
              color: "#FBF9F4",
              padding: "12px 22px",
              borderRadius: 999,
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            7 dias grátis, sem cartão
          </span>
          <span
            style={{
              border: "2px solid #B8872B",
              color: "#7A5A17",
              padding: "10px 20px",
              borderRadius: 999,
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            Contador de graça em todos os planos
          </span>
        </div>
      </div>
    ),
    size,
  );
}
