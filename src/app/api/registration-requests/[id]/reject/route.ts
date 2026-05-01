import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Role } from "@prisma/client";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== Role.BIZANET_CEO) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const request = await prisma.companyRegistrationRequest.findUnique({
      where: { id: params.id }
    });

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Request is not pending" }, { status: 400 });
    }

    // Update status to REJECTED
    const updatedRequest = await prisma.companyRegistrationRequest.update({
      where: { id: params.id },
      data: {
        status: "REJECTED",
        reviewedByUserId: user.id,
        reviewedAt: new Date()
      }
    });

    // Add Audit Log
    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "REJECT_REGISTRATION_REQUEST",
        entityType: "CompanyRegistrationRequest",
        message: `Rejected registration request for company ${request.companyName}`
      }
    });

    return NextResponse.json({ success: true, request: updatedRequest });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
