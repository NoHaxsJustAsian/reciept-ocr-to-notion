import React, { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, CheckCircle2, XCircle, Image, Upload } from "lucide-react"
import { ThemeProvider } from '@/components/ui/theme-provider'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"

const NotionIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M4 4.5V19.5C4 20.3284 4.67157 21 5.5 21H18.5C19.3284 21 20 20.3284 20 19.5V4.5C20 3.67157 19.3284 3 18.5 3H5.5C4.67157 3 4 3.67157 4 4.5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7 7H17"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7 12H17"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7 17H13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export default function ReceiptOCR() {
  const FLASK_API_URL = 'http://localhost:5001'
  const [image, setImage] = useState<File | null>(null)
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [uploadToNotion, setUploadToNotion] = useState<boolean>(true)
  const [notionAuthenticated, setNotionAuthenticated] = useState<boolean>(false)

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const authStatus = urlParams.get('auth')
    const message = urlParams.get('message')
    const details = urlParams.get('details')
    const token = urlParams.get('token')

    if (authStatus === 'success') {
      if (token) {
        localStorage.setItem('notion_token', token)
        setNotionAuthenticated(true)
        toast.success("Authentication with Notion was successful.", {
          icon: <NotionIcon />,
        })
      } else {
        toast.error("Authentication succeeded but no token received.", {
          icon: <XCircle />,
        })
      }
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (authStatus === 'error') {
      toast.error(`Authentication failed: ${message || 'Unknown error.'} ${details || ''}`, {
        icon: <XCircle />,
      })
      window.history.replaceState({}, document.title, window.location.pathname)
    } else {
      const storedToken = localStorage.getItem('notion_token')
      if (storedToken) {
        setNotionAuthenticated(true)
      }
    }
  }, [])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0])
      toast.success("Image uploaded successfully.", {
        icon: <Image />,
      })
    }
  }

  const processReceipt = async () => {
    if (!image) return
    
    setLoading(true)
    const formData = new FormData()
    formData.append('receipt_image', image)
    formData.append('upload_to_notion', String(uploadToNotion))

    const token = localStorage.getItem('notion_token')

    try {
      const response = await fetch(`${FLASK_API_URL}/process_receipt`, {
        method: 'POST',
        body: formData,
        headers: {
          ...(uploadToNotion && notionAuthenticated && token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      })
      const data = await response.json()
      if (response.ok) {
        setResult(JSON.stringify(data.items, null, 2))
        toast.success("Receipt processed successfully.", {
          icon: <CheckCircle2 />,
        })
        if (uploadToNotion && notionAuthenticated) {
          toast.success("Receipt data uploaded to Notion.", {
            icon: <NotionIcon />,
          })
        }
      } else {
        setResult(data.error || "Failed to process the receipt.")
        toast.error(data.error || "Failed to process the receipt.", {
          icon: <XCircle />,
        })
      }
    } catch (error) {
      console.error("Error processing receipt:", error)
      setResult("Failed to process the receipt.")
      toast.error("Failed to process the receipt.", {
        icon: <XCircle />,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleNotionAuthentication = () => {
    const notionAuthUrl = `https://api.notion.com/v1/oauth/authorize?client_id=120d872b-594c-8086-a877-003712936b54&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A5001%2Fnotion_callback&owner=user`
    window.location.href = notionAuthUrl
  }

  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <div className="flex flex-col items-center justify-center min-h-screen p-4 relative">
        <div className="absolute top-4 right-4">
          <ModeToggle />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Receipt OCR and Notion Uploader</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="image-upload">Upload Receipt Image</Label>
              <Input id="image-upload" type="file" accept="image/*" onChange={handleImageUpload} />
            </div>
            
            {notionAuthenticated ? (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="upload-to-notion"
                  checked={uploadToNotion}
                  onCheckedChange={(checked) => {
                    setUploadToNotion(checked as boolean)
                    toast(checked ? "Notion upload enabled" : "Notion upload disabled", {
                      icon: checked ? <Upload /> : <XCircle />,
                    })
                  }}
                />
                <Label htmlFor="upload-to-notion">Upload to Notion</Label>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">To auto populate your Notion, please authenticate with Notion, and press use a template provided by the developer.</p>
                <Button onClick={handleNotionAuthentication} className="w-full">
                  Authenticate with Notion
                </Button>
              </>
            )}

            <Button onClick={processReceipt} disabled={!image || loading || (uploadToNotion && !notionAuthenticated)} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Process Receipt'
              )}
            </Button>
          </CardContent>
        </Card>
        {result && (
          <Card className="w-full max-w-md mt-8">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Processed Items</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="p-4 rounded-md overflow-x-auto">{result}</pre>
            </CardContent>
          </Card>
        )}
        <Toaster />
      </div>
    </ThemeProvider>
  )
}