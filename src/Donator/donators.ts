import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

/**
 * ➕ Add Donator (with first donation)
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, phone, address, amount, paidAmount, userId, paymentMethod } =
      req.body;

    // Validate mandatory fields
    if (!name || !amount || !userId || !paymentMethod) {
      return res.status(400).json({
        error: "Name, amount, userId, and paymentMethod are required",
      });
    }

    // Validate payment method options
    const allowedMethods = ["Not Done", "Cash", "Online"];
    if (!allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({
        error: `paymentMethod must be one of ${allowedMethods.join(", ")}`,
      });
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
            paymentMethod,
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
    const { donationId, paidAmount, paymentMethod, name } = req.body as {
      donationId: number;
      paidAmount?: number;
      paymentMethod?: "Not Done" | "Cash" | "Online";
      name?: string;
    };

    if (!donationId) {
      return res.status(400).json({ error: "donationId is required" });
    }

    // Validate paymentMethod if provided
    const allowedMethods = ["Not Done", "Cash", "Online"];
    if (paymentMethod && !allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({
        error: `paymentMethod must be one of ${allowedMethods.join(", ")}`,
      });
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
        ...(paidAmount !== undefined && {
          paidAmount,
          balance: existingDonation.amount - paidAmount,
          status:
            paidAmount === existingDonation.amount
              ? "PAID"
              : paidAmount > 0
              ? "PARTIAL"
              : "PENDING",
        }),
        ...(paymentMethod && { paymentMethod }),
      },
    });

    // 3️⃣ Update donator name if provided
    if (name) {
      await prisma.donator.update({
        where: { id: donatorId },
        data: { name },
      });
    }

    // 4️⃣ Fetch all donations for this donor to recalc totals
    const donations = await prisma.donation.findMany({
      where: { donatorId },
    });

    const totalPaid = donations.reduce((sum, d) => sum + d.paidAmount, 0);
    const totalBalance = donations.reduce((sum, d) => sum + d.balance, 0);

    // 5️⃣ Return updated donation + donor totals
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
