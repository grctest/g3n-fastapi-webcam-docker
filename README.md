# Gemma 3n Webcam Analysis Application

A modern web application featuring real-time webcam analysis powered by Google's Gemma 3n AI model. The frontend provides an intuitive interface for webcam capture, AI-powered image analysis, and persona-based interactions, with a backend API for model management.

## 🚀 Features

- **Interactive Frontend**: Modern React-based interface with real-time webcam capture
- **AI-Powered Analysis**: Image analysis using Google Gemma 3n model
- **Persona System**: Customizable AI personalities for different analysis scenarios
- **Webcam Integration**: Live camera feed with instant capture and analysis

## 📋 Development requirements

- Python 3.11+
- Node.js 18+ (for frontend development)
- CUDA-compatible GPU (optional, but recommended)
- Webcam/Camera device
- 64GB+ RAM
- WSL (Windows Subsystem for Linux) for frontend builds

## Docker user setup

If you're not interested in making changes to the project and building the image from scratch, follow these steps:

### Step 1: Pull the image from docker hub

``

### Step 2: Create and run the container

``

## 🛠️ Developer Installation & Setup

### Step 1: Setup the backend

```bash
# Clone the repository
git clone https://github.com/grctest/g3n-fastapi-webcam-docker.git
cd g3n-fastapi-webcam-docker

# Create and activate environment
conda create -n g3n python=3.11
conda activate g3n

# Install dependencies
pip install -r requirements.txt

# Download the Gemma model
pip install -U "huggingface_hub[cli]"
huggingface-cli download google/gemma-3n-E2B-it --local-dir app/models/google/gemma-3n-E2B-it
```

### Step 2: Frontend Setup

#### Build the Frontend (Required)

1. **Open WSL (Windows Subsystem for Linux)**
2. **Navigate to frontend directory and build:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```
3. **Exit WSL**

#### Run FastAPI

This will provide both the REST API access to python functions, as well as host the frontend of the web app.

`uvicorn app.main:app --host 0.0.0.0 --port 8080`

Or you can build the docker image manually & run it in a dev container:

```bash
# Clone the repository
git clone https://github.com/grctest/g3n-fastapi-webcam-docker.git
cd g3n-fastapi-webcam-docker
docker build -t gemma3n_webcam_app .
docker run -p 8080:8080 --gpus all gemma3n_webcam_app
```

## 🚀 Using the Application

### Frontend Interface

1. **Open your browser** to `http://localhost:8080/`
2. **Allow webcam access** when prompted
3. **Select or create a persona**
4. **Either Capture Frames manually or Enable interval captures** to process the webcam footage.
5. **View results** once the frame has been processed by Gemma 3n.

## 📖 API Documentation

The backend API documentation is available at `http://localhost:8080/docs` 

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.