import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// ✅ Register user (SAME AS ORIGINAL)
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save user
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role },
    });

    res.json({ message: "User registered successfully", user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Login user (ENHANCED WITH MANDAL SUPPORT)
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Find user with role and mandals
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        userMandals: {
          include: {
            mandal: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Extract mandal data
    const mandals =
      user.userMandals?.map((um) => ({
        id: um.mandal?.id,
        name: um.mandal?.name,
        description: um.mandal?.description,
        joinedAt: um.joinedAt,
      })) || [];

    // Generate token with both id and role (SAME AS ORIGINAL)
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mandals, // NEW: Include mandals in response
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
