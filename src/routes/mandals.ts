import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
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

/**
 * 🏢 Create new Mandal (Admin only)
 */
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { role } = (req as any).user;

    if (role.name !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can create mandals" });
    }

    const { name, password, description } = req.body;

    if (!name || !password) {
      return res.status(400).json({ error: "Name and password are required" });
    }

    // Check if mandal already exists
    const existingMandal = await prisma.mandal.findUnique({
      where: { name },
    });

    if (existingMandal) {
      return res.status(400).json({ error: "Mandal already exists" });
    }

    // Hash mandal password
    const hashedPassword = await bcrypt.hash(password, 10);

    const mandal = await prisma.mandal.create({
      data: {
        name,
        password: hashedPassword,
        description,
      },
    });

    // Don't return the hashed password
    const { password: _, ...mandalResponse } = mandal;
    res.json(mandalResponse);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 🔐 Join Mandal with password
 */
router.post("/join", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: userId } = (req as any).user;
    const { mandalName, password } = req.body;

    if (!mandalName || !password) {
      return res
        .status(400)
        .json({ error: "Mandal name and password are required" });
    }

    // Find mandal
    const mandal = await prisma.mandal.findUnique({
      where: { name: mandalName },
    });

    if (!mandal) {
      return res.status(404).json({ error: "Mandal not found" });
    }

    // Verify mandal password
    const isPasswordValid = await bcrypt.compare(password, mandal.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Invalid mandal password" });
    }

    // Check if user is already part of this mandal
    const existingUserMandal = await prisma.userMandal.findUnique({
      where: {
        userId_mandalId: {
          userId: userId,
          mandalId: mandal.id,
        },
      },
    });

    if (existingUserMandal) {
      return res
        .status(400)
        .json({ error: "You are already part of this mandal" });
    }

    // Add user to mandal
    await prisma.userMandal.create({
      data: {
        userId: userId,
        mandalId: mandal.id,
      },
    });

    const { password: _, ...mandalResponse } = mandal;
    res.json({ message: "Successfully joined mandal", mandal: mandalResponse });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 📋 Get user's mandals
 */
router.get(
  "/my-mandals",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: userId } = (req as any).user;

      const userMandals = await prisma.userMandal.findMany({
        where: { userId },
        include: {
          mandal: {
            select: {
              id: true,
              name: true,
              description: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      const mandals = userMandals.map((um) => ({
        ...um.mandal,
        joinedAt: um.joinedAt,
      }));

      res.json(mandals);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * 🚪 Leave Mandal
 */
router.delete(
  "/leave/:mandalId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: userId } = (req as any).user;
      const mandalId = parseInt(req.params.mandalId);

      const userMandal = await prisma.userMandal.findUnique({
        where: {
          userId_mandalId: {
            userId: userId,
            mandalId: mandalId,
          },
        },
      });

      if (!userMandal) {
        return res
          .status(404)
          .json({ error: "You are not part of this mandal" });
      }

      await prisma.userMandal.delete({
        where: {
          userId_mandalId: {
            userId: userId,
            mandalId: mandalId,
          },
        },
      });

      res.json({ message: "Successfully left mandal" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
