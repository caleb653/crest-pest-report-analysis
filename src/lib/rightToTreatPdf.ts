import jsPDF from "jspdf";

export interface RightToTreatPdfInput {
  propertyName?: string;
  propertyAddress?: string | null;
  unitNumber?: string | null;
  signerName?: string | null;
  signerEmail?: string | null;
  reason?: string | null;
  locationType?: string | null;
  description?: string | null;
  signedAt?: string | null;
  signatureDataUrl?: string | null;
}

const PESTICIDE_NOTICE =
  "State law requires that you be given the following information: CAUTION—PESTICIDES ARE TOXIC CHEMICALS. " +
  "Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply " +
  "pesticides which are registered and approved for use by the California Department of Pesticide Regulation and the " +
  "United States Environmental Protection Agency. Registration is granted when the state finds that, based on existing " +
  "scientific evidence, there are no appreciable risks if proper use conditions are followed or that the risks are " +
  "outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should be minimized. " +
  "If within 24 hours following application you experience symptoms similar to common seasonal illness comparable to the " +
  "flu, contact your physician or poison control center (800-222-1222) and your pest control company immediately. " +
  "For further information, contact: Crest Pest Control (949-424-5000); Health Questions—County Health Department " +
  "(800-564-8448); Application Information—County Agricultural Commissioner (714-955-0100); Regulatory Information—" +
  "Structural Pest Control Board (800-737-8188), 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815.";

const POSSIBLE_CHEMICALS = [
  "Alpine WSG (Dinotefuran)", "Bifen I/T (Bifenthrin)",
  "Essentria IC Pro (Geraniol, Clove Oil, Cornmint Oil)",
  "Temprid FX (Imidacloprid, Cyfluthrin)", "Termidor SC (Fipronil)",
  "Phantom (Chlorfenapyr)", "ExciteR (Pyrethrins, Piperonyl Butoxide)",
  "Gentrol IGR Concentrate ((S)-Hydroprene)", "Nyguard IGR Concentrate (Pyridine)",
  "PT Wasp Freeze (Prallethrin)", "PT Alpine Flea & Bed Bug (Dinotefuran, Pyriproxyfen, Prallethrin)",
  "PT Alpine Fly Bait", "Gentrol Aerosol ((S)-Hydroprene)",
  "Bedlam (Cyclopropanecarboxylate, Dicarboximide)", "Invade Hot Spot +",
  "Bifen LP (Bifenthrin)", "Advion Ant Gel Bait (Indoxacarb)",
  "Maxforce FC Ant Gel (Fipronil)", "MasterLine B MaxxPro",
  "Advion Cockroach Gel Bait (Indoxacarb)", "Contrac California (Bromethalin)",
  "Delta Dust (Deltamethrin)", "In2Care Mix (Pyriproxyfen, Beauveria bassiana Strain GHA)",
  "OneGuard (Lambda-cyhalothrin, Prallethrin, Pyriproxyfen, Piperonyl Butoxide)",
  "Advion Microflow (Indoxacarb)", "Optigard (Thiamethoxam)",
  "Crossfire Bedbug Concentrate (Clothianidin, Metofluthrin, Piperonyl Butoxide)",
  "Nibor-D Insecticide (Disodium Octaborate)",
  "Nibor-D Foam + IGR (Disodium Octaborate)",
  "Neogen SureKill SK100 (Pyrethrins, Piperonyl Butoxide, N-Octyl Bicycloheptene Dicarboximide)",
  "ProFoam Platinum (Foaming Agent)",
  "Invade Bio Cleaner (Citrus Oil, Microbes, Surfactants)",
  "Take Down II Soft Bait (Bromethalin)",
];

export async function downloadRightToTreatPdf(input: RightToTreatPdfInput) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const usable = pageWidth - margin * 2;
  let y = margin;

  const ensure = (need: number) => {
    if (y + need > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Header
  doc.setFillColor(42, 42, 42);
  doc.rect(0, 0, pageWidth, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Right to Treat — Authorization", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Crest Pest Control · 949-424-5000", margin, 52);
  y = 90;
  doc.setTextColor(0, 0, 0);

  // Property block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Property Details", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const rows: [string, string][] = [
    ["Property", input.propertyName || "—"],
    ...(input.propertyAddress ? [["Address", input.propertyAddress] as [string, string]] : []),
    ...(input.unitNumber ? [["Unit", input.unitNumber] as [string, string]] : []),
    ...(input.reason ? [["Reason", `${input.reason}${input.locationType ? ` (${input.locationType})` : ""}`] as [string, string]] : []),
    ...(input.description ? [["Notes", input.description] as [string, string]] : []),
  ];

  for (const [k, v] of rows) {
    const lines = doc.splitTextToSize(`${k}: ${v}`, usable);
    ensure(lines.length * 12 + 4);
    doc.text(lines, margin, y);
    y += lines.length * 12 + 2;
  }
  y += 8;

  // Authorization statement
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  ensure(20);
  doc.text("Authorization", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const auth = doc.splitTextToSize(
    "By signing below, the undersigned authorizes Crest Pest Control to enter and treat the unit identified above. " +
    "The technician will apply EPA-registered pest control products consistent with their professional judgment and the property's service plan.",
    usable,
  );
  ensure(auth.length * 12 + 4);
  doc.text(auth, margin, y);
  y += auth.length * 12 + 12;

  // Pesticide notice
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  ensure(20);
  doc.text("Pesticide Notice", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const notice = doc.splitTextToSize(PESTICIDE_NOTICE, usable);
  for (const line of notice) {
    ensure(11);
    doc.text(line, margin, y);
    y += 11;
  }
  y += 8;

  // Chemicals
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  ensure(20);
  doc.text("Possible Chemicals Used", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const colWidth = usable / 2;
  const half = Math.ceil(POSSIBLE_CHEMICALS.length / 2);
  const left = POSSIBLE_CHEMICALS.slice(0, half);
  const right = POSSIBLE_CHEMICALS.slice(half);
  const startY = y;
  let leftY = startY;
  for (const item of left) {
    const lines = doc.splitTextToSize("• " + item, colWidth - 8);
    if (leftY + lines.length * 11 > pageHeight - margin) { doc.addPage(); leftY = margin; }
    doc.text(lines, margin, leftY);
    leftY += lines.length * 11;
  }
  let rightY = startY;
  for (const item of right) {
    const lines = doc.splitTextToSize("• " + item, colWidth - 8);
    if (rightY + lines.length * 11 > pageHeight - margin) { doc.addPage(); rightY = margin; }
    doc.text(lines, margin + colWidth, rightY);
    rightY += lines.length * 11;
  }
  y = Math.max(leftY, rightY) + 14;

  // Signature block
  ensure(120);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Signature", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Signer: ${input.signerName || "—"}`, margin, y); y += 13;
  if (input.signerEmail) { doc.text(`Email: ${input.signerEmail}`, margin, y); y += 13; }
  doc.text(`Signed: ${input.signedAt ? new Date(input.signedAt).toLocaleString() : "—"}`, margin, y);
  y += 16;

  if (input.signatureDataUrl) {
    try {
      ensure(90);
      doc.setDrawColor(180);
      doc.rect(margin, y, 240, 80);
      doc.addImage(input.signatureDataUrl, "PNG", margin + 4, y + 4, 232, 72);
      y += 90;
    } catch {
      // ignore image errors
    }
  }

  const safeName = (input.signerName || "right-to-treat").replace(/[^a-z0-9-]+/gi, "_");
  doc.save(`right-to-treat-${safeName}.pdf`);
}

export async function downloadBlankRightToTreatPdf(propertyName?: string) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const usable = pageWidth - margin * 2;
  let y = margin;

  const ensure = (need: number) => {
    if (y + need > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFillColor(42, 42, 42);
  doc.rect(0, 0, pageWidth, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Right to Treat — Authorization", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Crest Pest Control · 949-424-5000", margin, 52);
  y = 90;
  doc.setTextColor(0, 0, 0);

  // Property details — blank lines
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Property Details", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const fields: string[] = [
    `Property: ${propertyName || "______________________________________________"}`,
    "Address: __________________________________________________",
    "Unit: _______________________   Date: ____________________",
    "Reason for Treatment: _______________________________________",
    "Notes: _____________________________________________________",
    "        _____________________________________________________",
  ];
  for (const line of fields) {
    ensure(16);
    doc.text(line, margin, y);
    y += 16;
  }
  y += 8;

  // Authorization
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  ensure(20);
  doc.text("Authorization", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const auth = doc.splitTextToSize(
    "By signing below, the undersigned authorizes Crest Pest Control to enter and treat the unit identified above. " +
    "The technician will apply EPA-registered pest control products consistent with their professional judgment and the property's service plan.",
    usable,
  );
  ensure(auth.length * 12 + 4);
  doc.text(auth, margin, y);
  y += auth.length * 12 + 12;

  // Pesticide notice
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  ensure(20);
  doc.text("Pesticide Notice", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const notice = doc.splitTextToSize(PESTICIDE_NOTICE, usable);
  for (const line of notice) {
    ensure(11);
    doc.text(line, margin, y);
    y += 11;
  }
  y += 8;

  // Chemicals
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  ensure(20);
  doc.text("Possible Chemicals Used", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const colWidth = usable / 2;
  const half = Math.ceil(POSSIBLE_CHEMICALS.length / 2);
  const left = POSSIBLE_CHEMICALS.slice(0, half);
  const right = POSSIBLE_CHEMICALS.slice(half);
  const startY = y;
  let leftY = startY;
  for (const item of left) {
    const lines = doc.splitTextToSize("• " + item, colWidth - 8);
    if (leftY + lines.length * 11 > pageHeight - margin) { doc.addPage(); leftY = margin; }
    doc.text(lines, margin, leftY);
    leftY += lines.length * 11;
  }
  let rightY = startY;
  for (const item of right) {
    const lines = doc.splitTextToSize("• " + item, colWidth - 8);
    if (rightY + lines.length * 11 > pageHeight - margin) { doc.addPage(); rightY = margin; }
    doc.text(lines, margin + colWidth, rightY);
    rightY += lines.length * 11;
  }
  y = Math.max(leftY, rightY) + 20;

  // Signature lines
  ensure(140);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Signature", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Printed Name: ______________________________________", margin, y); y += 22;
  doc.text("Email: _____________________________________________", margin, y); y += 22;
  doc.text("Date: ______________________________________________", margin, y); y += 28;
  doc.setDrawColor(120);
  doc.line(margin, y + 30, margin + 280, y + 30);
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text("Signature", margin, y + 44);
  doc.setTextColor(0, 0, 0);

  doc.save("right-to-treat-blank.pdf");
}