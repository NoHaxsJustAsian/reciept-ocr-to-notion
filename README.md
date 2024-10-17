# Receipt OCR and Notion Uploader

This project allows you to upload an image of a receipt, extract its text using OCR, and optionally upload the extracted information (items, prices, and quantities) to a Notion database. 
It's built using Flask for the backend and React for the frontend.

## Features

- **OCR (Optical Character Recognition)**: Extract text from receipt images using tesseract.
- **Notion Integration**: Automatically upload receipt items to a Notion database.
- **GPT Integration**: Cleans and formats extracted text into common names.
- **Frontend**: Built using React with Tailwind CSS for a user-friendly interface.

## Live Demo

The project is hosted on [recieptocr.com](https://recieptocr.com).

## How sync with Notion

1. Click "Authenticate with Notion"
2. Press "Next"
3. Select "Use a template provided by the developer"
4. Press "Authenticate"

If you want to build it yourself by following the steps below.
## Prerequisites
To run this project, you need the following:

- **Python** (for the backend)
- **Node.js and npm** (for the frontend)
- **Docker** (optional for containerization)
- **Flask** for the backend API
- **React** for the frontend
- **Pytesseract** for OCR
- **Tesseract** for Pytesseract
- **OpenAI API Key** for text processing
- **Notion API Key** for uploading items to Notion

You can install the required Python packages by running:

```bash
pip install -r requirements.txt
```

Environment Variables
Create a .env file in the root directory of the project and include the following variables:
```.env
HOSTNAME=your-frontend-url
REDIRECT_URI=your-redirect-uri
NOTION_CLIENT_ID=your-notion-client-id
NOTION_CLIENT_SECRET=your-notion-client-secret
OPENAI_API_KEY=your-openai-api-key
```

## Setup

### Backend (Flask)

1. Clone the repository:

    ```bash
    git clone https://github.com/your-username/your-repo-name.git
    cd your-repo-name/backend
    ```

2. Create a virtual environment (optional but recommended):

    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

3. Install Python dependencies:

    ```bash
    pip install -r requirements.txt
    ```

4. Set up environment variables:

    Ensure your `.env` file is correctly set up in the backend directory.

5. Run the Flask API:

    ```bash
    flask run
    ```

The Flask server will start running on [http://localhost:5000](http://localhost:5000).

### Frontend (React)

1. Navigate to the frontend directory:

    ```bash
    cd ../frontend
    ```

2. Install Node dependencies:

    ```bash
    npm install
    ```

3. Set up environment variables:

    Create a `.env` file in the frontend directory with the following content:

    ```bash
    REACT_APP_API_URL=http://localhost:5000
    ```

    Adjust the `REACT_APP_API_URL` if your backend is hosted elsewhere.

4. Start the React development server:

    ```bash
    npm start
    ```

### Running backend with Docker (Optional)

1. Ensure Docker is installed.

2. Build the Docker images for the backend and frontend:

    From the root directory of the project, run:

    ```bash
    docker-compose build
    ```

3. Start the containers:

    ```bash
    docker-compose up
    ```
