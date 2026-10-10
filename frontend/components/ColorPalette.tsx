"use client";

const PALETTE: Array<{ hex: string; name: string }> = [
  { hex: "#000000", name: "Ink" },
  { hex: "#7f7f7f", name: "Ash" },
  { hex: "#ffffff", name: "Chalk" },
  { hex: "#e4572e", name: "Papaya" },
  { hex: "#f4a259", name: "Apricot" },
  { hex: "#f7d154", name: "Honey" },
  { hex: "#6a994e", name: "Moss" },
  { hex: "#386641", name: "Fern" },
  { hex: "#2a9d8f", name: "Lagoon" },
  { hex: "#457b9d", name: "Denim" },
  { hex: "#1d3557", name: "Midnight" },
  { hex: "#9b5de5", name: "Grape" },
  { hex: "#f15bb5", name: "Bubblegum" },
  { hex: "#ff6b6b", name: "Coral" },
  { hex: "#8ac926", name: "Lime" },
  { hex: "#00bbf9", name: "Sky" },
  { hex: "#00f5d4", name: "Mint" },
  { hex: "#fee440", name: "Lemon" },
  { hex: "#f1faee", name: "Cream" },
  { hex: "#a8dadc", name: "Seafoam" },
  { hex: "#e29578", name: "Clay" },
  { hex: "#c1121f", name: "Cardinal" },
  { hex: "#7b2cbf", name: "Plum" },
  { hex: "#582f0e", name: "Cocoa" },
];

interface Props {
  color: string;
  onChange: (hex: string) => void;
}

export function ColorPalette({ color, onChange }: Props) {
  return (
    <div>
      <div className="palette" role="group" aria-label="Color palette">
        {PALETTE.map((c) => (
          <button
            key={c.hex}
            type="button"
            className="swatch"
            style={{ background: c.hex }}
            title={c.name}
            aria-label={c.name}
            aria-pressed={color.toLowerCase() === c.hex.toLowerCase()}
            onClick={() => onChange(c.hex)}
          />
        ))}
      </div>
      <label className="custom-color-row">
        <span>Custom</span>
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Custom color"
        />
        <span className="mono">{color.toUpperCase()}</span>
      </label>
    </div>
  );
}
