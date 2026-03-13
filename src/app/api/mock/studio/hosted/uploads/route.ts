import { NextResponse } from "next/server";
import { uploadHostedMockFiles } from "@/server/studio/hosted-mock-store";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const folderIdValue = formData.get("folderId");
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        {
          error: "No files were provided.",
        },
        { status: 400 }
      );
    }

    const snapshot = await uploadHostedMockFiles({
      files,
      folderId:
        typeof folderIdValue === "string" && folderIdValue.trim().length > 0
          ? folderIdValue
          : null,
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Hosted mock upload failed.",
      },
      { status: 400 }
    );
  }
}
