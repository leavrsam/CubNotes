import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const platform = (searchParams.get("platform") || "").toLowerCase();

  // 1. Android: Direct static file
  if (platform === "android" || platform === "apk") {
    return NextResponse.redirect(new URL("/Motif.apk", request.url));
  }

  // 2. Fetch latest release assets from GitHub API
  try {
    const res = await fetch("https://api.github.com/repos/leavrsam/CubNotes/releases/latest", {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Motif-App-Downloader"
      },
      next: { revalidate: 60 }
    });

    if (res.ok) {
      const release = await res.json();
      const assets = release.assets || [];

      // macOS Apple Silicon (M1/M2/M3/M4)
      if (platform === "mac-arm64" || platform === "mac-m1" || platform === "mac-silicon") {
        const asset = assets.find((a: any) => 
          a.name.endsWith(".dmg") && (a.name.includes("aarch64") || a.name.includes("arm64"))
        );
        if (asset?.browser_download_url) {
          return NextResponse.redirect(asset.browser_download_url);
        }
      }

      // macOS Intel
      if (platform === "mac-intel" || platform === "mac-x64") {
        const asset = assets.find((a: any) => 
          a.name.endsWith(".dmg") && (a.name.includes("x64") || a.name.includes("x86_64"))
        );
        if (asset?.browser_download_url) {
          return NextResponse.redirect(asset.browser_download_url);
        }
      }

      // macOS General
      if (platform === "mac" || platform === "macos" || platform === "dmg") {
        const armAsset = assets.find((a: any) => 
          a.name.endsWith(".dmg") && (a.name.includes("aarch64") || a.name.includes("arm64"))
        );
        const anyDmg = armAsset || assets.find((a: any) => a.name.endsWith(".dmg"));
        if (anyDmg?.browser_download_url) {
          return NextResponse.redirect(anyDmg.browser_download_url);
        }
      }

      // Windows
      if (platform === "windows" || platform === "win" || platform === "exe" || platform === "msi") {
        const exeAsset = assets.find((a: any) => a.name.endsWith(".exe") || a.name.endsWith(".msi"));
        if (exeAsset?.browser_download_url) {
          return NextResponse.redirect(exeAsset.browser_download_url);
        }
      }
    }
  } catch (err) {
    console.warn("Failed to fetch release assets:", err);
  }

  // Fallback: Redirect to /download page
  return NextResponse.redirect(new URL("/download?status=preparing", request.url));
}
