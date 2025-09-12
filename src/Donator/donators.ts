import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

/**
 * ➕ Add Donator (with first donation)
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, phone, address, amount, paidAmount, userId } = req.body;

    if (!name || !amount || !userId) {
      return res
        .status(400)
        .json({ error: "Name, amount and userId are required" });
    }

    const balance = amount - (paidAmount || 0);

    // Determine status
    let status: "PAID" | "PARTIAL" | "PENDING" = "PENDING";
    if (paidAmount && paidAmount >= amount) {
      status = "PAID";
    } else if (paidAmount && paidAmount > 0) {
      status = "PARTIAL";
    }

    // Create Donator + Donation
    const donator = await prisma.donator.create({
      data: {
        name,
        phone,
        address,
        donations: {
          create: {
            userId,
            amount,
            paidAmount: paidAmount || 0,
            balance,
            status,
          },
        },
      },
      include: { donations: true },
    });

    res.json(donator);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 📋 Get all Donators (with donations)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const donators = await prisma.donator.findMany({
      include: { donations: true },
    });
    res.json(donators);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
/**
 * 📊 Get donation summary (total amount, paid, balance)
 */
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const donations = await prisma.donation.findMany();

    const totalAmount = donations.reduce((sum, d) => sum + d.amount, 0);
    const totalPaid = donations.reduce((sum, d) => sum + d.paidAmount, 0);
    const totalBalance = donations.reduce((sum, d) => sum + d.balance, 0);

    res.json({
      totalAmount,
      totalPaid,
      totalBalance,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
/**
 * 📋 Get single Donator by ID
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const donator = await prisma.donator.findUnique({
      where: { id: Number(id) }, // 👈 convert string → number
      include: { donations: true },
    });

    if (!donator) return res.status(404).json({ error: "Donator not found" });

    res.json(donator);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// src/Donator/donators.ts

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, totalAmount, balanceAmount } = req.body;

    const donator = await prisma.donator.update({
      where: { id: Number(id) },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(totalAmount && { totalAmount: Number(totalAmount) }),
        ...(balanceAmount && { balanceAmount: Number(balanceAmount) }),
      },
    });

    res.json(donator);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:donatorId/donation", async (req: Request, res: Response) => {
  try {
    const donatorId = Number(req.params.donatorId);
    const { donationId, paidAmount } = req.body as {
      donationId: number;
      paidAmount: number;
    };

    if (!donationId || paidAmount === undefined) {
      return res
        .status(400)
        .json({ error: "donationId and paidAmount are required" });
    }

    // 1️⃣ Fetch the donation
    const existingDonation = await prisma.donation.findUnique({
      where: { id: donationId },
    });

    if (!existingDonation) {
      return res.status(404).json({ error: "Donation not found" });
    }

    // 2️⃣ Update the donation
    const updatedDonation = await prisma.donation.update({
      where: { id: donationId },
      data: {
        paidAmount,
        balance: existingDonation.amount - paidAmount,
        status:
          paidAmount === existingDonation.amount
            ? "PAID"
            : paidAmount > 0
            ? "PARTIAL"
            : "PENDING",
      },
    });

    // 3️⃣ Fetch all donations for this donor to recalc totals
    const donations = await prisma.donation.findMany({
      where: { donatorId },
    });

    const totalPaid = donations.reduce((sum, d) => sum + d.paidAmount, 0);
    const totalBalance = donations.reduce((sum, d) => sum + d.balance, 0);

    // 4️⃣ Return updated donation + donor totals
    res.json({
      donation: updatedDonation,
      donorTotals: {
        totalPaid,
        totalBalance,
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
