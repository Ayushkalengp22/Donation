import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

const router = Router();
const prisma = new PrismaClient();

// Middleware to verify JWT & extract user (SAME AS YOUR ORIGINAL)
function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Helper function to get user's accessible mandals
async function getUserMandals(userId: number) {
  const userMandals = await prisma.userMandal.findMany({
    where: { userId },
    select: { mandalId: true },
  });
  return userMandals.map((um) => um.mandalId);
}

// Helper function to check if user has access to mandal
async function checkMandalAccess(userId: number, mandalId: number) {
  const userMandal = await prisma.userMandal.findUnique({
    where: {
      userId_mandalId: {
        userId: userId,
        mandalId: mandalId,
      },
    },
  });
  return !!userMandal;
}

/**
 * ➕ Add Donator (with first donation) - ENHANCED WITH MANDAL
 */
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
      mandalId, // NEW: Required mandal ID
    } = req.body;

    if (!name || !amount || !paymentMethod || !mandalId) {
      return res.status(400).json({
        error: "Name, amount, paymentMethod, and mandalId are required",
      });
    }

    // NEW: Check if user has access to this mandal
    const hasAccess = await checkMandalAccess(userId, mandalId);
    if (!hasAccess) {
      return res
        .status(403)
        .json({ error: "You don't have access to this mandal" });
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
        mandalId, // NEW: Assign to mandal
        donations: {
          create: {
            userId,
            amount,
            paidAmount: paidAmount || 0,
            balance,
            status,
            paymentMethod,
            bookNumber,
            mandalId, // NEW: Donation also belongs to mandal
          },
        },
      },
      include: {
        donations: true,
        mandal: {
          // NEW: Include mandal info
          select: { id: true, name: true },
        },
      },
    });

    res.json(donator);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 📋 Get all Donators - ENHANCED WITH MANDAL FILTERING
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { mandalId } = req.query;

    // If no authentication, return all (for backwards compatibility)
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      const donators = await prisma.donator.findMany({
        where: mandalId ? { mandalId: parseInt(mandalId as string) } : {},
        include: {
          donations: true,
          mandal: { select: { id: true, name: true } },
        },
      });
      return res.json(donators);
    }

    // NEW: With authentication, filter by user's mandals
    try {
      const token = authHeader.split(" ")[1];
      const decoded: any = jwt.verify(token, JWT_SECRET);

      const accessibleMandalIds = await getUserMandals(decoded.id);

      if (accessibleMandalIds.length === 0) {
        return res.json([]);
      }

      let whereClause: any = {
        mandalId: { in: accessibleMandalIds },
      };

      // If specific mandal requested, filter by it (if user has access)
      if (mandalId) {
        const requestedMandalId = parseInt(mandalId as string);
        if (accessibleMandalIds.includes(requestedMandalId)) {
          whereClause.mandalId = requestedMandalId;
        } else {
          return res
            .status(403)
            .json({ error: "You don't have access to this mandal" });
        }
      }

      const donators = await prisma.donator.findMany({
        where: whereClause,
        include: {
          donations: true,
          mandal: { select: { id: true, name: true } },
        },
      });

      res.json(donators);
    } catch (jwtErr) {
      // If JWT is invalid, return all (backwards compatibility)
      const donators = await prisma.donator.findMany({
        where: mandalId ? { mandalId: parseInt(mandalId as string) } : {},
        include: {
          donations: true,
          mandal: { select: { id: true, name: true } },
        },
      });
      res.json(donators);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 📊 Get donation summary - ENHANCED WITH MANDAL FILTERING
 */
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const { mandalId } = req.query;

    // If no authentication, return all summary (for backwards compatibility)
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      const donations = await prisma.donation.findMany({
        where: mandalId ? { mandalId: parseInt(mandalId as string) } : {},
      });

      const totalAmount = donations.reduce((sum, d) => sum + d.amount, 0);
      const totalPaid = donations.reduce((sum, d) => sum + d.paidAmount, 0);
      const totalBalance = donations.reduce((sum, d) => sum + d.balance, 0);

      return res.json({ totalAmount, totalPaid, totalBalance });
    }

    // NEW: With authentication, filter by user's mandals
    try {
      const token = authHeader.split(" ")[1];
      const decoded: any = jwt.verify(token, JWT_SECRET);

      const accessibleMandalIds = await getUserMandals(decoded.id);

      if (accessibleMandalIds.length === 0) {
        return res.json({ totalAmount: 0, totalPaid: 0, totalBalance: 0 });
      }

      let whereClause: any = {
        mandalId: { in: accessibleMandalIds },
      };

      if (mandalId) {
        const requestedMandalId = parseInt(mandalId as string);
        if (accessibleMandalIds.includes(requestedMandalId)) {
          whereClause.mandalId = requestedMandalId;
        } else {
          return res
            .status(403)
            .json({ error: "You don't have access to this mandal" });
        }
      }

      const donations = await prisma.donation.findMany({
        where: whereClause,
      });

      const totalAmount = donations.reduce((sum, d) => sum + d.amount, 0);
      const totalPaid = donations.reduce((sum, d) => sum + d.paidAmount, 0);
      const totalBalance = donations.reduce((sum, d) => sum + d.balance, 0);

      res.json({ totalAmount, totalPaid, totalBalance });
    } catch (jwtErr) {
      // If JWT is invalid, return all summary (backwards compatibility)
      const donations = await prisma.donation.findMany({
        where: mandalId ? { mandalId: parseInt(mandalId as string) } : {},
      });

      const totalAmount = donations.reduce((sum, d) => sum + d.amount, 0);
      const totalPaid = donations.reduce((sum, d) => sum + d.paidAmount, 0);
      const totalBalance = donations.reduce((sum, d) => sum + d.balance, 0);

      res.json({ totalAmount, totalPaid, totalBalance });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 📋 Get single Donator by ID - ENHANCED WITH MANDAL CHECK
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const donator = await prisma.donator.findUnique({
      where: { id: Number(id) },
      include: {
        donations: true,
        mandal: { select: { id: true, name: true } },
      },
    });

    if (!donator) return res.status(404).json({ error: "Donator not found" });

    // NEW: Check mandal access if authenticated
    const authHeader = req.headers["authorization"];
    if (authHeader) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded: any = jwt.verify(token, JWT_SECRET);

        const hasAccess = await checkMandalAccess(
          decoded.id,
          donator.mandalId || 0
        );
        if (!hasAccess) {
          return res
            .status(403)
            .json({ error: "You don't have access to this donator's mandal" });
        }
      } catch (jwtErr) {
        // If JWT is invalid, continue (backwards compatibility)
      }
    }

    res.json(donator);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 🔄 Update Donator - ENHANCED WITH MANDAL CHECK
 */
router.put("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { role, id: userId } = (req as any).user;
    if (role.name !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can update donators" });
    }

    const { id } = req.params;
    const { name, phone, address } = req.body;

    // NEW: Check if donator exists and user has access
    const existingDonator = await prisma.donator.findUnique({
      where: { id: Number(id) },
    });

    if (!existingDonator) {
      return res.status(404).json({ error: "Donator not found" });
    }

    const hasAccess = await checkMandalAccess(
      userId,
      existingDonator.mandalId || 0
    );
    if (!hasAccess) {
      return res
        .status(403)
        .json({ error: "You don't have access to this donator's mandal" });
    }

    const donator = await prisma.donator.update({
      where: { id: Number(id) },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(address && { address }),
      },
      include: {
        mandal: { select: { id: true, name: true } },
      },
    });

    res.json(donator);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 💰 Update Donation Payment - ENHANCED WITH MANDAL CHECK
 */
router.patch(
  "/:donatorId/donation",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { role, id: userId } = (req as any).user;
      if (role.name !== "ADMIN") {
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

      // NEW: Check if user has access to this donation's mandal
      const hasAccess = await checkMandalAccess(
        userId,
        existingDonation.mandalId || 0
      );
      if (!hasAccess) {
        return res
          .status(403)
          .json({ error: "You don't have access to this donation's mandal" });
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

/**
 * 📖 Get donations by book number - ENHANCED WITH MANDAL FILTERING
 */
router.get("/book/:bookNumber", authMiddleware, async (req, res) => {
  try {
    const { role, id: userId } = (req as any).user;
    if (role.name !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Only admins can view bookwise donations" });
    }

    const { bookNumber } = req.params;
    const { mandalId } = req.query;

    // NEW: Get user's accessible mandals
    const accessibleMandalIds = await getUserMandals(userId);

    if (accessibleMandalIds.length === 0) {
      return res.json([]);
    }

    let whereClause: any = {
      bookNumber,
      mandalId: { in: accessibleMandalIds },
    };

    // If specific mandal requested
    if (mandalId) {
      const requestedMandalId = parseInt(mandalId as string);
      if (accessibleMandalIds.includes(requestedMandalId)) {
        whereClause.mandalId = requestedMandalId;
      } else {
        return res
          .status(403)
          .json({ error: "You don't have access to this mandal" });
      }
    }

    const donations = await prisma.donation.findMany({
      where: whereClause,
      include: {
        donator: true,
        mandal: { select: { id: true, name: true } },
      },
    });

    res.json(donations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 📊 Get book summary - ENHANCED WITH MANDAL FILTERING
 */
router.get("/summary/book/:bookNumber", authMiddleware, async (req, res) => {
  try {
    const { bookNumber } = req.params;
    const { id: userId } = (req as any).user;
    const { mandalId } = req.query;

    // NEW: Get user's accessible mandals
    const accessibleMandalIds = await getUserMandals(userId);

    if (accessibleMandalIds.length === 0) {
      return res.json({
        bookNumber,
        totalAmount: 0,
        totalPaid: 0,
        totalBalance: 0,
      });
    }

    let whereClause: any = {
      bookNumber,
      mandalId: { in: accessibleMandalIds },
    };

    // If specific mandal requested
    if (mandalId) {
      const requestedMandalId = parseInt(mandalId as string);
      if (accessibleMandalIds.includes(requestedMandalId)) {
        whereClause.mandalId = requestedMandalId;
      } else {
        return res
          .status(403)
          .json({ error: "You don't have access to this mandal" });
      }
    }

    const donations = await prisma.donation.findMany({
      where: whereClause,
    });

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
