import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      companyName,
      ownerName,
      phone,
      email,
      country,
      city,
      address,
      estimatedCustomers,
      message,
    } = body;

    if (!companyName || !ownerName || !phone || !country || !city) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const request = await prisma.companyRegistrationRequest.create({
      data: {
        companyName,
        ownerName,
        phone,
        email: email || null,
        country,
        city,
        address: address || null,
        estimatedCustomers: estimatedCustomers || null,
        message: message || null,
        status: "PENDING"
      }
    });

    return NextResponse.json({ success: true, request });
  } catch (error: any) {
    console.error("Registration Request Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
