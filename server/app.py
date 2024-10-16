from flask import Flask, request, jsonify, redirect, make_response
from flask_cors import CORS
from PIL import Image
import pytesseract
from openai import OpenAI
import requests
import io
from dotenv import load_dotenv
import os
import base64 

load_dotenv()

HOSTNAME = os.getenv('HOSTNAME')
REDIRECT_URI = os.getenv('REDIRECT_URI')
NOTION_CLIENT_ID = os.getenv('NOTION_CLIENT_ID')
NOTION_CLIENT_SECRET = os.getenv('NOTION_CLIENT_SECRET')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=[HOSTNAME]) 

# Validate environment variables
missing_vars = []
if not REDIRECT_URI:
    missing_vars.append('REDIRECT_URI')
if not NOTION_CLIENT_ID:
    missing_vars.append('NOTION_CLIENT_ID')
if not NOTION_CLIENT_SECRET:
    missing_vars.append('NOTION_CLIENT_SECRET')
if not OPENAI_API_KEY:
    missing_vars.append('OPENAI_API_KEY')

if missing_vars:
    raise ValueError(f"Missing environment variables: {', '.join(missing_vars)}")

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
)

# Helper function to retrieve the OCR database from Notion
def get_ocr_database_id(access_token):
    url = "https://api.notion.com/v1/search"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }
    data = {
        "filter": {
            "property": "object",
            "value": "database"
        }
    }

    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code == 200:
        results = response.json().get('results', [])
        for result in results:
            title_property = result.get('title', [])
            title_text = ''.join([t.get('text', {}).get('content', '') for t in title_property])
            if title_text == "OCR":
                print(f"Found OCR Database: {title_text}")
                return result['id']
        print("No OCR database found.")
        return None
    else:
        print(f"Failed to retrieve databases: {response.status_code} - {response.text}")
        return None

def perform_ocr(image):
    img = Image.open(image)
    text = pytesseract.image_to_string(img)
    return text

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

def add_item_to_notion(item_name, price, quantity, database_id, access_token):
    url = "https://api.notion.com/v1/pages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }
    data = {
        "parent": {"database_id": database_id},
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
                            "content": f"${price}"
                        }
                    }
                ]
            },
            "Quantity": {
                "number": quantity
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

@app.route("/process_receipt", methods=["POST"])
def process_receipt():
    # Get the 'upload_to_notion' flag
    upload_to_notion_str = request.form.get('upload_to_notion', 'true').lower()
    upload_to_notion = upload_to_notion_str in ['true', '1', 'yes']
    print(f"upload_to_notion: {upload_to_notion}")

    access_token = None
    if upload_to_notion:
        # Extract the access token from the Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            print("Missing Authorization header.")
            return jsonify({"error": "Unauthorized: Missing Authorization header"}), 401
        
        # Expected format: 'Bearer <access_token>'
        if not auth_header.startswith('Bearer '):
            print("Invalid Authorization header format.")
            return jsonify({"error": "Unauthorized: Invalid Authorization header format"}), 401
        
        access_token = auth_header.split(' ')[1]
        print(f"Access Token: {access_token}")

    # Proceed with receipt processing
    if 'receipt_image' not in request.files:
        print("No receipt image uploaded.")
        return jsonify({"error": "No receipt image uploaded"}), 400
    
    image = request.files['receipt_image']
    
    # Step 1: Perform OCR
    raw_text = perform_ocr(io.BytesIO(image.read()))
    print(f"OCR Text: {raw_text}")
    
    if not raw_text.strip():
        print("OCR failed to extract any text.")
        return jsonify({"error": "OCR failed to extract any text."}), 500
    
    # Step 2: Clean items using OpenAI GPT
    cleaned_items = clean_items(raw_text)
    print(f"Cleaned Items: {cleaned_items}")
    
    if not cleaned_items:
        print("Failed to clean items using OpenAI.")
        return jsonify({"error": "Failed to clean items using OpenAI."}), 500
    
    # Step 3: Get the OCR Database ID if uploading to Notion
    database_id = None
    if upload_to_notion:
        database_id = get_ocr_database_id(access_token)
        if not database_id:
            print("No OCR database found in Notion.")
            return jsonify({"error": "No OCR database found in Notion."}), 404
    
    # Step 4: Optionally send to Notion
    items = cleaned_items.split('\n')
    added_items = []
    for item in items:
        try:
            # Parsing format: "quantity x item_name - $price"
            quantity_and_name, price = item.rsplit('-', 1)
            quantity, item_name = quantity_and_name.split('x', 1)
            quantity = int(quantity.strip())
            price = float(price.strip().replace('$', ''))
            item_name = item_name.strip()

            if upload_to_notion:
                success = add_item_to_notion(
                    item_name=item_name,
                    price=price,
                    quantity=quantity,
                    database_id=database_id,
                    access_token=access_token
                )
                if not success:
                    continue  # Skip adding to the list if Notion addition failed

            added_items.append({
                "quantity": quantity,
                "item_name": item_name,
                "price": price
            })
        except ValueError as ve:
            print(f"ValueError parsing item '{item}': {ve}")
            continue
        except Exception as e:
            print(f"Unexpected error parsing item '{item}': {e}")
            continue

    return jsonify({"message": "Receipt processed successfully", "items": added_items})

# Route to handle Notion OAuth callback
@app.route('/notion_callback', methods=['GET'])
def notion_callback():
    # Notion redirects with 'code' as a query parameter
    notion_code = request.args.get('code')
    print(f"Received Notion Code: {notion_code}")
    
    if not notion_code:
        print("No code provided in the request.")
        return redirect(f'{HOSTNAME}/?auth=error&message=No+code+provided')
    
    # Exchange the code for an access token
    token_url = 'https://api.notion.com/v1/oauth/token'
    token_data = {
        'grant_type': 'authorization_code',
        'code': notion_code,
        'redirect_uri': REDIRECT_URI,
    }

    print(f"Exchanging code for token with data: {token_data}")

    # Encode CLIENT_ID and CLIENT_SECRET in base64
    credentials = f"{NOTION_CLIENT_ID}:{NOTION_CLIENT_SECRET}"
    encoded_credentials = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
    
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Basic {encoded_credentials}',  # Add the Authorization header
    }

    response = requests.post(token_url, headers=headers, json=token_data)
    print(f"Token exchange response status: {response.status_code}")
    print(f"Token exchange response body: {response.text}")

    if response.status_code == 200:
        access_token = response.json().get('access_token')
        if access_token:
            print("Access token retrieved successfully.")
            # Redirect to frontend with access_token included in the URL
            return redirect(f'{HOSTNAME}/?auth=success&token={access_token}')
        else:
            print("Access token not found in the response.")
            return redirect(f'{HOSTNAME}/?auth=error&message=Access+token+not+found')
    else:
        # Handle cases where the response might not be JSON
        try:
            error_info = response.json()
            error_message = error_info.get('error', 'Unknown error')
            error_description = error_info.get('error_description', '')
        except ValueError:
            error_message = 'Unknown error'
            error_description = response.text
        
        print(f"Failed to retrieve access token: {error_message} - {error_description}")
        # Redirect to frontend with error details
        return redirect(f'{HOSTNAME}/?auth=error&message={error_message.replace(" ", "+")}&details={error_description.replace(" ", "+")}')

# Optional: Endpoint to check backend status
@app.route('/status', methods=['GET'])
def status():
    return jsonify({"message": "Backend is running"}), 200

if __name__ == "__main__":
    app.run(host='0.0.0.0')