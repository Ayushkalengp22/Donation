import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import donatorRoutes from "./routes/donators";
// import reportRouter from "./Report/report";
import mandalRoutes from "./routes/mandals";

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Test route
app.get("/", (req: Request, res: Response) => {
  res.send("Donation Backend Running 🚀");
});
// Auth routes
app.use("/api/auth", authRoutes);
app.use("/api/donators", donatorRoutes);
app.use("/api/mandals", mandalRoutes);
// app.use("/report", reportRouter);

// Example: protected test route
app.get("/protected", (req: Request, res: Response) => {
  res.json({
    message: "This is a protected route (will add middleware later)",
  });
});

// // Add User
// app.post("/users", async (req: Request, res: Response) => {
//   try {
//     const { name, email, password } = req.body;

//     if (!name || !email || !password) {
//       return res.status(400).json({ error: "All fields are required" });
//     }

//     const user = await prisma.user.create({
//       data: { name, email, password },
//     });
//     res.json(user);
//   } catch (err: any) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // Get Users
// app.get("/users", async (req: Request, res: Response) => {
//   try {
//     const users = await prisma.user.findMany();
//     res.json(users);
//   } catch (err: any) {
//     res.status(500).json({ error: err.message });
//   }
// });

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
