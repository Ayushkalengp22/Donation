import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import PDFDocument from "pdfkit";
import type PDFKit from "pdfkit";

const router = Router();
const prisma = new PrismaClient();

interface ReportData {
  name: string;
  totalAmount: number;
  totalPaid: number;
  totalBalance: number;
  status: string;
}

router.get("/pdf", async (req: Request, res: Response) => {
  try {
    const donors = await prisma.donator.findMany({
      include: { donations: true },
    });

    const reportData: ReportData[] = donors.map((donor) => {
      const totalAmount = donor.donations.reduce((sum, d) => sum + d.amount, 0);
      const totalPaid = donor.donations.reduce(
        (sum, d) => sum + d.paidAmount,
        0
      );
      const totalBalance = donor.donations.reduce(
        (sum, d) => sum + d.balance,
        0
      );
      const status =
        totalBalance === 0 ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";

      return {
        name: donor.name,
        totalAmount,
        totalPaid,
        totalBalance,
        status,
      };
    });

    // Create PDF document
    const doc = new PDFDocument({
      margin: 50,
      size: "A4",
      bufferPages: true,
    });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=donors_report.pdf"
    );

    doc.pipe(res);

    // Add content
    addHeader(doc);
    addTitle(doc, "Donors Financial Report");
    addSummarySection(doc, reportData);
    addTable(doc, reportData);
    addFooter(doc);

    doc.end();
  } catch (err: any) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate PDF report" });
  }
});

// Helper function to add header
function addHeader(doc: PDFKit.PDFDocument) {
  const currentDate = new Date().toLocaleDateString();
  const currentTime = new Date().toLocaleTimeString();

  // Company/Organization header
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("DONATION MANAGEMENT SYSTEM", 50, 50, { align: "left" });

  // Date and time
  doc
    .fontSize(10)
    .font("Helvetica")
    .text(`Generated on: ${currentDate} at ${currentTime}`, 400, 50, {
      align: "right",
    });

  // Add a line under header
  doc
    .moveTo(50, 75)
    .lineTo(545, 75)
    .strokeColor("#cccccc")
    .lineWidth(1)
    .stroke();
}

// Helper function to add title
function addTitle(doc: PDFKit.PDFDocument, title: string) {
  doc
    .fontSize(24)
    .font("Helvetica-Bold")
    .fillColor("#2c3e50")
    .text(title, 50, 100, { align: "center" });
  doc.moveDown(2);
}

// Helper function to add summary section
function addSummarySection(doc: PDFKit.PDFDocument, data: ReportData[]) {
  const totalDonors = data.length;
  const totalAmount = data.reduce((sum, d) => sum + d.totalAmount, 0);
  const totalPaid = data.reduce((sum, d) => sum + d.totalPaid, 0);
  const totalBalance = data.reduce((sum, d) => sum + d.totalBalance, 0);
  const paidCount = data.filter((d) => d.status === "PAID").length;
  const partialCount = data.filter((d) => d.status === "PARTIAL").length;
  const pendingCount = data.filter((d) => d.status === "PENDING").length;

  const summaryY = 150;

  // Summary box background
  doc.rect(50, summaryY, 495, 80).fillColor("#f8f9fa").fill();

  doc.rect(50, summaryY, 495, 80).strokeColor("#dee2e6").lineWidth(1).stroke();

  // Summary title
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .fillColor("#495057")
    .text("SUMMARY", 60, summaryY + 10);

  // Summary data
  doc.fontSize(10).font("Helvetica");

  const leftColumn = 70;
  const rightColumn = 320;
  let yPos = summaryY + 35;

  doc
    .fillColor("#6c757d")
    .text(`Total Donors: ${totalDonors}`, leftColumn, yPos)
    .text(
      `Paid: ${paidCount} | Partial: ${partialCount} | Pending: ${pendingCount}`,
      rightColumn,
      yPos
    );

  yPos += 15;

  doc
    .text(
      `Total Amount: ₹${totalAmount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })}`,
      leftColumn,
      yPos
    )
    .text(
      `Total Paid: ₹${totalPaid.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })}`,
      rightColumn,
      yPos
    );

  yPos += 15;

  doc.text(
    `Outstanding Balance: ₹${totalBalance.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    })}`,
    leftColumn,
    yPos
  );
}

// Helper function to add table
function addTable(doc: PDFKit.PDFDocument, data: ReportData[]) {
  const tableTop = 260;
  const rowHeight = 30;
  const startX = 50;

  // Table configuration
  const headers = [
    "Donor Name",
    "Total Amount",
    "Amount Paid",
    "Balance",
    "Status",
  ];
  const columnWidths = [150, 100, 100, 100, 95];
  const tableWidth = columnWidths.reduce((a, b) => a + b, 0);

  let currentY = tableTop;

  // Draw table header background
  doc.rect(startX, currentY, tableWidth, rowHeight).fillColor("#343a40").fill();

  // Draw table header border
  doc
    .rect(startX, currentY, tableWidth, rowHeight)
    .strokeColor("#000000")
    .lineWidth(1)
    .stroke();

  // Draw header text
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#ffffff");

  let currentX = startX;

  headers.forEach((header, i) => {
    doc.text(header, currentX + 8, currentY + 10, {
      width: columnWidths[i] - 16,
      align: i === 0 ? "left" : "center",
    });

    // Draw vertical lines for header
    if (i > 0) {
      doc
        .moveTo(currentX, currentY)
        .lineTo(currentX, currentY + rowHeight)
        .strokeColor("#000000")
        .stroke();
    }

    currentX += columnWidths[i];
  });

  // Draw right border of header
  doc
    .moveTo(currentX, currentY)
    .lineTo(currentX, currentY + rowHeight)
    .strokeColor("#000000")
    .stroke();

  currentY += rowHeight;

  // Draw data rows
  doc.font("Helvetica").fontSize(10);

  data.forEach((row, index) => {
    const isEvenRow = index % 2 === 0;

    // Alternate row colors
    if (isEvenRow) {
      doc
        .rect(startX, currentY, tableWidth, rowHeight)
        .fillColor("#f8f9fa")
        .fill();
    }

    // Draw row border
    doc
      .rect(startX, currentY, tableWidth, rowHeight)
      .strokeColor("#dee2e6")
      .lineWidth(0.5)
      .stroke();

    // Set text color based on status
    let textColor = "#212529";
    let statusColor = "#212529";

    switch (row.status) {
      case "PAID":
        statusColor = "#28a745";
        break;
      case "PARTIAL":
        statusColor = "#ffc107";
        break;
      case "PENDING":
        statusColor = "#dc3545";
        break;
    }

    currentX = startX;

    // Donor Name
    doc.fillColor(textColor).text(row.name, currentX + 8, currentY + 10, {
      width: columnWidths[0] - 16,
      align: "left",
      ellipsis: true,
    });
    currentX += columnWidths[0];

    // Total Amount
    doc.text(
      `₹${row.totalAmount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })}`,
      currentX + 8,
      currentY + 10,
      { width: columnWidths[1] - 16, align: "right" }
    );
    currentX += columnWidths[1];

    // Amount Paid
    doc.text(
      `₹${row.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      currentX + 8,
      currentY + 10,
      { width: columnWidths[2] - 16, align: "right" }
    );
    currentX += columnWidths[2];

    // Balance
    doc.text(
      `₹${row.totalBalance.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })}`,
      currentX + 8,
      currentY + 10,
      { width: columnWidths[3] - 16, align: "right" }
    );
    currentX += columnWidths[3];

    // Status
    doc
      .fillColor(statusColor)
      .font("Helvetica-Bold")
      .text(row.status, currentX + 8, currentY + 10, {
        width: columnWidths[4] - 16,
        align: "center",
      });

    // Draw vertical lines
    currentX = startX;
    columnWidths.forEach((width) => {
      currentX += width;
      doc
        .moveTo(currentX, currentY)
        .lineTo(currentX, currentY + rowHeight)
        .strokeColor("#dee2e6")
        .lineWidth(0.5)
        .stroke();
    });

    currentY += rowHeight;

    // Add new page if needed
    if (currentY > 700) {
      doc.addPage();
      addHeader(doc);
      currentY = 100;
    }
  });

  // Draw final bottom border
  doc
    .moveTo(startX, currentY)
    .lineTo(startX + tableWidth, currentY)
    .strokeColor("#000000")
    .lineWidth(1)
    .stroke();
}

// Helper function to add footer
function addFooter(doc: PDFKit.PDFDocument) {
  const pageCount = doc.bufferedPageRange().count;

  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);

    // Add footer line
    doc
      .moveTo(50, 750)
      .lineTo(545, 750)
      .strokeColor("#cccccc")
      .lineWidth(1)
      .stroke();

    // Add footer text
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#6c757d")
      .text(`Page ${i + 1} of ${pageCount}`, 50, 760, { align: "center" })
      .text("Generated by Donation Management System", 50, 770, {
        align: "center",
      });
  }
}

export default router;
