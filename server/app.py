from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import pytesseract
from openai import OpenAI
import requests
import io
from dotenv import load_dotenv
import os

load_dotenv()

# Flask app setup
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Set your OpenAI and Notion credentials

NOTION_INTEGRATION_TOKEN = os.getenv('NOTION_INTEGRATION_TOKEN')
DATABASE_ID = "120b62718b0f800bbd62d440f23560f7"

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
)

# OCR function
def perform_ocr(image):
    img = Image.open(image)
    text = pytesseract.image_to_string(img)
    return text

# Clean items using OpenAI GPT, including quantity, item name, and price
def clean_items(raw_text):
    prompt = f"""
    Here is the text from a receipt:
    {raw_text}
    
    Please extract the item names, quantities, and convert them to common names. Return the quantities, item names, and prices in the format: "quantity x item_name - $price".
    """
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "user", "content": prompt}
        ],
        max_tokens=200,
        temperature=0.5
    )
    return response.choices[0].message.content.strip()

def add_item_to_notion(item_name, price, quantity):
    url = "https://api.notion.com/v1/pages"
    headers = {
        "Authorization": f"Bearer {NOTION_INTEGRATION_TOKEN}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }
    data = {
        "parent": {"database_id": DATABASE_ID},
        "properties": {
            "Name": {
                "title": [
                    {
                        "type": "text",
                        "text": {
                            "content": item_name
                        }
                    }
                ]
            },
            "Price": {
                "rich_text": [
                    {
                        "type": "text",
                        "text": {
                            "content": str(price)
                        }
                    }
                ]
            },
            "Quantity": {
                "multi_select": [
                    {
                        "name": str(quantity)
                    }
                ]
            }
        }
    }
    response = requests.post(url, json=data, headers=headers)

    if response.status_code == 200:
        print(f"Item '{item_name}' added to Notion")
        return True
    else:
        print(f"Error: {response.status_code}, {response.text}")
        return False
    
# API endpoint to process the receipt
@app.route("/process_receipt", methods=["POST"])
def process_receipt():
    if 'receipt_image' not in request.files:
        return jsonify({"error": "No receipt image uploaded"}), 400

    image = request.files['receipt_image']
    upload_to_notion_str = request.form.get('upload_to_notion', 'true').lower()
    upload_to_notion = upload_to_notion_str in ['true', '1', 'yes']

    # Step 1: Perform OCR
    raw_text = perform_ocr(io.BytesIO(image.read()))

    # Step 2: Clean items using OpenAI GPT
    cleaned_items = clean_items(raw_text)

    # Step 3: Optionally send to Notion
    items = cleaned_items.split('\n')
    for item in items:
        try:
            # Parsing format: "quantity x item_name - $price"
            quantity_and_name, price = item.rsplit('-', 1)
            quantity, item_name = quantity_and_name.split('x', 1)
            if upload_to_notion:
                add_item_to_notion(
                    item_name.strip(),
                     f"${float(price.strip().replace('$', ''))}",  # Add $ in front of price
                    int(quantity.strip())
                )
        except ValueError:
            continue

    return jsonify({"message": "Receipt processed successfully", "items": cleaned_items})


# Run the Flask app
if __name__ == "__main__":
    app.run(debug=True, port=5001)  # Change to any available port, e.g., 5001
