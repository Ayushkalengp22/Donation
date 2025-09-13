import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

const router = Router();
const prisma = new PrismaClient();

// Middleware to verify JWT & extract user
function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1]; // "Bearer <token>"

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * ➕ Add Donator (with first donation)
 */

// Only ADMIN can add donation
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { role, id: userId } = (req as any).user;

    if (role.name !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can add donations" });
    }

    const {
      name,
      phone,
      address,
      amount,
      paidAmount,
      paymentMethod,
      bookNumber,
    } = req.body;

    if (!name || !amount || !paymentMethod) {
      return res.status(400).json({
        error: "Name, amount, and paymentMethod are required",
      });
    }

    const allowedMethods = ["Not Done", "Cash", "Online"];
    if (!allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({
        error: `paymentMethod must be one of ${allowedMethods.join(", ")}`,
      });
    }

    const balance = amount - (paidAmount || 0);

    let status: "PAID" | "PARTIAL" | "PENDING" = "PENDING";
    if (paidAmount && paidAmount >= amount) {
      status = "PAID";
    } else if (paidAmount && paidAmount > 0) {
      status = "PARTIAL";
    }

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
            bookNumber,
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
router.put("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { role } = (req as any).user;
    if (role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can update donators" });
    }

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

router.patch(
  "/:donatorId/donation",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { role } = (req as any).user;
      if (role !== "ADMIN") {
        return res
          .status(403)
          .json({ error: "Only admins can update donations" });
      }
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
  }
);

router.get("/book/:bookNumber", authMiddleware, async (req, res) => {
  try {
    const { role } = (req as any).user;
    if (role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Only admins can view bookwise donations" });
    }

    const { bookNumber } = req.params;

    const donations = await prisma.donation.findMany({
      where: { bookNumber },
      include: { donator: true },
    });

    res.json(donations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/summary/book/:bookNumber", authMiddleware, async (req, res) => {
  try {
    const { bookNumber } = req.params;

    const donations = await prisma.donation.findMany({ where: { bookNumber } });

    const totalAmount = donations.reduce((sum, d) => sum + d.amount, 0);
    const totalPaid = donations.reduce((sum, d) => sum + d.paidAmount, 0);
    const totalBalance = donations.reduce((sum, d) => sum + d.balance, 0);

    res.json({
      bookNumber,
      totalAmount,
      totalPaid,
      totalBalance,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
