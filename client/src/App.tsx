import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckIcon,
  Cross2Icon,
  ImageIcon,
  UploadIcon,
  CalendarIcon,
} from "@radix-ui/react-icons";
import { Loader2 } from "lucide-react";
import { ThemeProvider, useTheme } from "@/components/ui/theme-provider";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { Toaster } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export default function ReceiptOCR() {
  const FLASK_API_URL = "https://reciept-ocr-to-notion.onrender.com";
  const [image, setImage] = useState<File | null>(null);
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadToNotion, setUploadToNotion] = useState<boolean>(false);
  const [notionAuthenticated, setNotionAuthenticated] =
    useState<boolean>(false);
  const { theme } = useTheme();

  // Define maximum limits
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_IMAGE_WIDTH = 4000;
  const MAX_IMAGE_HEIGHT = 4000;

  // Handle OAuth callback by extracting the 'auth' and 'token' query parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get("auth");
    const message = urlParams.get("message");
    const details = urlParams.get("details");
    const token = urlParams.get("token");

    if (authStatus === "success") {
      if (token) {
        localStorage.setItem("notion_token", token);
        setNotionAuthenticated(true);
        toast.success("Authentication with Notion was successful.", {
          icon: (
            <img
              src="/notion.svg"
              alt="Notion"
              className={`h-6 w-6 ${
                theme === "dark" ? "notion-icon-dark" : "notion-icon-light"
              }`}
            />
          ),
        });
      } else {
        toast.error("Authentication succeeded but no token received.", {
          icon: <Cross2Icon />,
        });
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authStatus === "error") {
      toast.error(
        `Authentication failed: ${message || "Unknown error."} ${
          details || ""
        }`,
        {
          icon: <Cross2Icon />,
        }
      );
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const storedToken = localStorage.getItem("notion_token");
      if (storedToken) {
        setNotionAuthenticated(true);
      }
    }
  }, [theme]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // File Size Validation
      if (file.size > MAX_FILE_SIZE) {
        toast.error(
          `Image is too large. Maximum allowed size is ${
            MAX_FILE_SIZE / (1024 * 1024)
          }MB.`,
          {
            icon: <Cross2Icon />,
          }
        );
        return; // Exit the function early
      }

      // Image Dimension Validation
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        if (img.width > MAX_IMAGE_WIDTH || img.height > MAX_IMAGE_HEIGHT) {
          toast.error(
            `Image dimensions are too large. Maximum allowed size is ${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT} pixels.`,
            {
              icon: <Cross2Icon />,
            }
          );
          URL.revokeObjectURL(objectUrl); // Clean up
          return;
        } else {
          setImage(file);
          toast.success("Image uploaded successfully.", {
            icon: <ImageIcon />,
          });
        }
      };
      img.onerror = () => {
        toast.error("Invalid image file.", {
          icon: <Cross2Icon />,
        });
        URL.revokeObjectURL(objectUrl); // Clean up
      };
      img.src = objectUrl;
    }
  };

  const processReceipt = async () => {
    if (!image) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("receipt_image", image);
    formData.append("upload_to_notion", String(uploadToNotion));

    const token = localStorage.getItem("notion_token");

    try {
      // Process the receipt without requiring Notion authentication
      const response = await fetch(`${FLASK_API_URL}/process_receipt`, {
        method: "POST",
        body: formData,
        headers: {
          ...(uploadToNotion && notionAuthenticated && token
            ? { Authorization: `Bearer ${token}` }
            : {}),
        },
      });

      const data = await response.json();
      if (response.ok) {
        // Always show the OCR result
        setResult(JSON.stringify(data.items, null, 2));
        toast.success("Receipt processed successfully.", {
          icon: <CheckIcon />,
        });

        // Only show Notion upload success message if authenticated and uploading to Notion
        if (uploadToNotion && notionAuthenticated) {
          toast.success("Receipt data uploaded to Notion.", {
            icon: (
              <img
                src="/notion.svg"
                alt="Notion"
                className={`h-6 w-6 ${
                  theme === "dark" ? "notion-icon-dark" : "notion-icon-light"
                }`}
              />
            ),
          });
        }
      } else {
        setResult(data.error || "Failed to process the receipt.");
        toast.error(data.error || "Failed to process the receipt.", {
          icon: <Cross2Icon />,
        });
      }
    } catch (error) {
      console.error("Error processing receipt:", error);
      setResult("Failed to process the receipt.");
      toast.error("Failed to process the receipt.", {
        icon: <Cross2Icon />,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNotionAuthentication = () => {
    const notionAuthUrl = `https://api.notion.com/v1/oauth/authorize?client_id=120d872b-594c-8086-a877-003712936b54&response_type=code&owner=user&redirect_uri=https%3A%2F%2Freciept-ocr-to-notion.onrender.com%2Fnotion_callback`;
    window.location.href = notionAuthUrl;
  };

  const handleLogout = () => {
    localStorage.removeItem("notion_token");
    setNotionAuthenticated(false);
    toast.success("Logged out successfully.");
  };

  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <div className="flex flex-col items-center justify-center min-h-screen p-4 relative">
        <div className="absolute top-4 right-4 flex items-center space-x-4">
          <Badge
            className={notionAuthenticated ? "bg-green-600" : "bg-red-600"}
          >
            {notionAuthenticated
              ? "Notion Authenticated"
              : "Notion Not Authenticated"}
          </Badge>
          {notionAuthenticated && (
            <Button variant="ghost" onClick={handleLogout}>
              Log out
            </Button>
          )}
          <ModeToggle />
        </div>
        <div className="flex space-x-4 items-center justify-center mb-4">
          <img
            src={'/notion.svg'}
            alt="Notion"
            className={`h-12 w-12 md:h-16 md:w-16 ${
              theme === "dark" ? "notion-icon-dark" : "notion-icon-light"
            }`}
          />
          <img
            src={'/reciept.svg'}
            alt="Receipt"
            className={`h-12 w-12 md:h-16 md:w-16 ${
              theme === "dark" ? "notion-icon-dark" : "notion-icon-light"
            }`}
          />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">
              Receipt OCR and Notion Uploader
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Image Upload */}
            <div className="space-y-2">
              <Label htmlFor="image-upload">Upload Receipt Image</Label>
              <Input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
              />
            </div>

            {/* Notion Authentication Section */}
            {notionAuthenticated ? (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="upload-to-notion"
                  checked={uploadToNotion}
                  onCheckedChange={(checked) => {
                    setUploadToNotion(checked as boolean);
                    toast(
                      checked
                        ? "Notion upload enabled"
                        : "Notion upload disabled",
                      {
                        icon: checked ? <UploadIcon /> : <Cross2Icon />,
                      }
                    );
                  }}
                />
                <Label htmlFor="upload-to-notion">Upload to Notion</Label>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  To auto populate your Notion, please authenticate with Notion.
                </p>
                <Button onClick={handleNotionAuthentication} className="w-full">
                  Authenticate with Notion
                </Button>
              </>
            )}

            {/* Process Receipt Button */}
            <Button
              onClick={processReceipt}
              disabled={!image || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Process Receipt"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Display Processed Items */}
        {result && (
          <Card className="w-full max-w-md mt-8">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">
                Processed Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(() => {
                  try {
                    const parsedResult = JSON.parse(result);
                    return parsedResult.map((item: any, index: number) => (
                      <p key={index}>
                        <strong>{item.item_name}</strong>: {item.quantity} x $
                        {item.price.toFixed(2)}
                      </p>
                    ));
                  } catch (error) {
                    return <p>{result}</p>;
                  }
                })()}
              </div>
            </CardContent>
          </Card>
        )}
        <p className="absolute bottom-4 left-4 text-xs text-muted-foreground leading-loose">
          Built by{" "}
          <HoverCard>
            <HoverCardTrigger asChild>
              <a
                href="https://github.com/nohaxsjustasian"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-4"
              >
                @nohaxsjustasian
              </a>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="flex justify-between space-x-4">
                <Avatar>
                  <AvatarImage src="https://github.com/nohaxsjustasian.png" />
                  <AvatarFallback>TT</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">@nohaxsjustasian</h4>
                  <p className="text-sm">
                    NEU 25' | Searching for new grad SWE positions.
                  </p>
                  <div className="flex items-center pt-2">
                    <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />{" "}
                    <span className="text-xs text-muted-foreground">
                      Joined December 2021
                    </span>
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
          . The source code is available on{" "}
          <a
            href="https://github.com/nohaxsjustasian"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4"
          >
            GitHub
          </a>
          .
        </p>
        <Toaster />
      </div>
    </ThemeProvider>
  );
}
