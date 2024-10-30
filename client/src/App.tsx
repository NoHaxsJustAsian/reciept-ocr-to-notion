import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils"; // Utility function for class names

export default function ReceiptOCR() {
  const FLASK_API_URL = "https://reciept-ocr-to-notion.onrender.com";
  const STATUS_URL = `${FLASK_API_URL}/status`;

  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadToNotion, setUploadToNotion] = useState<boolean>(false);
  const [notionAuthenticated, setNotionAuthenticated] = useState<boolean>(false);
  const { theme } = useTheme();

  // New state variables for server spin-up
  const [isServerRunning, setIsServerRunning] = useState<boolean>(false);
  const [loadingServer, setLoadingServer] = useState<boolean>(false);

  // Define maximum limits
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_IMAGE_WIDTH = 4000; // pixels
  const MAX_IMAGE_HEIGHT = 4000; // pixels

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
              className="h-6 w-6 svg-theme"
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
        setIsServerRunning(true); // Assume server is running if token exists
        setNotionAuthenticated(true);
      }
    }
  }, [theme]);

  // Initial check if server is running on component mount
  useEffect(() => {
    const checkInitialServerStatus = async () => {
      try {
        const res = await fetch(STATUS_URL);
        const data = await res.json();
        if (data.message === "Backend is running") {
          setIsServerRunning(true);
        }
      } catch (error) {
        console.error("Error checking initial server status:", error);
      }
    };

    checkInitialServerStatus();

    return () => {
      // Clean up the preview URL when the component unmounts
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Handle image upload via Dropzone
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles[0]) {
      const file = acceptedFiles[0];
      handleImageFile(file);
    }
  }, []);

  // Handle paste event for images
  const handlePaste = useCallback((event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (file) {
            handleImageFile(file);
            event.preventDefault();
          }
        }
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("paste", handlePaste as any);
    return () => {
      window.removeEventListener("paste", handlePaste as any);
    };
  }, [handlePaste]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [],
    },
  });

  const handleImageFile = (file: File) => {
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
      return;
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
        URL.revokeObjectURL(objectUrl);
        return;
      } else {
        setImage(file);
        setPreviewUrl(objectUrl); // Set the preview URL
        toast.success("Image uploaded successfully.", {
          icon: <ImageIcon />,
        });
      }
    };
    img.onerror = () => {
      toast.error("Invalid image file.", {
        icon: <Cross2Icon />,
      });
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  const processReceipt = async () => {
    if (!image) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("receipt_image", image);
    formData.append("upload_to_notion", String(uploadToNotion));

    const token = localStorage.getItem("notion_token");

    try {
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
        setResult(JSON.stringify(data.items, null, 2));
        toast.success("Receipt processed successfully.", {
          icon: <CheckIcon />,
        });

        if (uploadToNotion && notionAuthenticated) {
          toast.success("Receipt data uploaded to Notion.", {
            icon: (
              <img
                src="/notion.svg"
                alt="Notion"
                className="h-6 w-6 svg-theme"
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
    setIsServerRunning(false);
    toast.success("Logged out successfully.");
  };

  // Function to start the server and check status
  const startAndCheckServerStatus = async () => {
    if (loadingServer || isServerRunning) return;

    setLoadingServer(true);

    try {
      await fetch(STATUS_URL);
    } catch (error) {
      console.error("Error initiating server spin-up:", error);
      toast.error("Failed to initiate server spin-up, please try again.", {
        icon: <Cross2Icon />,
      });
      setLoadingServer(false);
      return;
    }

    const pollInterval = 5000; // 5 seconds
    const totalDuration = 3 * 60 * 1000; // 3 minutes
    const startTime = Date.now();

    const interval = setInterval(async () => {
      try {
        const res = await fetch(STATUS_URL);
        const data = await res.json();
        if (data.message === "Backend is running") {
          clearInterval(interval);
          setIsServerRunning(true);
          setLoadingServer(false);
          toast.success("Server is up and running!");
        }
      } catch (error) {
        console.error("Error checking server status:", error);
      }

      const elapsed = Date.now() - startTime;

      if (elapsed >= totalDuration) {
        clearInterval(interval);
        setLoadingServer(false);
        toast.error("Server spin-up timed out.", { icon: <Cross2Icon /> });
      }
    }, pollInterval);
  };

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="flex flex-col items-center justify-center min-h-screen p-4 relative">
        {/* Top Right Controls */}
        <div className="absolute top-4 right-4 flex items-center space-x-4">
          {/* Server Status Badge */}
          <Badge
            className={isServerRunning ? "bg-green-600" : "bg-red-600"}
            title={
              isServerRunning
                ? "The backend server is currently running."
                : "The backend server is not running."
            }
          >
            {isServerRunning ? (
              <>
                <CheckIcon className="inline mr-1" /> Server Status
              </>
            ) : (
              <>
                <Cross2Icon className="inline mr-1" /> Server Status
              </>
            )}
          </Badge>

          {/* Notion Authentication Badge */}
          <Badge
            className={notionAuthenticated ? "bg-green-600" : "bg-red-600"}
            title={
              notionAuthenticated
                ? "You are authenticated with Notion."
                : "You are not authenticated with Notion."
            }
          >
            {notionAuthenticated ? (
              <>
                <CheckIcon className="inline mr-1" /> Notion
              </>
            ) : (
              <>
                <Cross2Icon className="inline mr-1" /> Notion
              </>
            )}
          </Badge>

          {/* Log out Button */}
          {notionAuthenticated && (
            <Button variant="ghost" onClick={handleLogout}>
              Log out
            </Button>
          )}

          {/* Theme Mode Toggle */}
          <ModeToggle />
        </div>

        {/* Server Spin-Up Button in Top-Left Corner */}
        {!isServerRunning && (
          <div className="absolute top-4 left-4">
            <Button
              variant="outline"
              onClick={startAndCheckServerStatus}
              className="flex items-center space-x-2"
            >
              {loadingServer ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Spinning up server...
                </>
              ) : (
                <span>Start Server</span>
              )}
            </Button>
          </div>
        )}

        {/* Logos */}
        <div className="flex space-x-4 items-center justify-center mb-4">
          <img
            src={"/notion.svg"}
            alt="Notion"
            className="h-12 w-12 svg-theme"
          />
          <img
            src={"/reciept.svg"}
            alt="Receipt"
            className="h-12 w-12 svg-theme"
          />
        </div>

        {/* Main Receipt OCR Card */}
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">
              Receipt OCR and Notion Uploader
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Image Upload using Dropzone */}
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-md p-6 text-center cursor-pointer",
                isDragActive ? "border-blue-500" : "border-gray-300"
              )}
            >
              <input {...getInputProps()} />
              <Label htmlFor="image-upload">Upload Receipt Image</Label>
              <p className="mt-2 text-sm text-gray-500">
                Drag and drop an image here, paste it, or click to select a file
              </p>
            </div>

            {/* Image Preview */}
            {previewUrl && (
              <div className="mt-4">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-w-full h-auto rounded-md border"
                />
              </div>
            )}

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
                  To auto-populate your Notion, please authenticate with Notion.
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

        {/* Footer with HoverCard */}
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
                    NEU '25 | Searching for new grad SWE positions.
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
