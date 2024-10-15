import React, { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export default function ReceiptOCR() {
  const FLASK_API_URL = 'http://localhost:5001'

  const [image, setImage] = useState<File | null>(null)
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [uploadToNotion, setUploadToNotion] = useState<boolean>(true)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0])
    }
  }

  const processReceipt = async () => {
    if (!image) return
    
    setLoading(true)
    const formData = new FormData()
    formData.append('receipt_image', image)
    formData.append('upload_to_notion', String(uploadToNotion))

    try {
      const response = await fetch(`${FLASK_API_URL}/process_receipt`, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      setResult(data.items)
    } catch (error) {
      console.error("Error processing receipt:", error)
      setResult("Failed to process the receipt.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Receipt OCR and Notion Uploader</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="image-upload">Upload Receipt Image</Label>
            <Input id="image-upload" type="file" accept="image/*" onChange={handleImageUpload} />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="upload-to-notion"
              checked={uploadToNotion}
              onCheckedChange={() => setUploadToNotion(!uploadToNotion)}
            />
            <Label htmlFor="upload-to-notion">Upload to Notion</Label>
          </div>
          <Button onClick={processReceipt} disabled={!image || loading} className="w-full">
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
            <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto">{result}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}