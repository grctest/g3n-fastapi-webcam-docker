# Gemma 3n Webcam Analysis Application

A modern web application featuring real-time webcam analysis powered by Google's Gemma 3n AI model. The frontend provides an intuitive interface for webcam capture, AI-powered image analysis, and persona-based interactions, with a backend API for model management.

## 🚀 Features

- **Interactive Frontend**: Modern React-based interface with real-time webcam capture
- **AI-Powered Analysis**: Real-time image analysis using Google Gemma 3n model
- **Persona System**: Customizable AI personalities for different analysis scenarios
- **Webcam Integration**: Live camera feed with instant capture and analysis

## 📋 Requirements

- Python 3.11+
- Node.js 18+ (for frontend development)
- CUDA-compatible GPU (optional, but recommended)
- Webcam/Camera device
- 8GB+ RAM (depending on model size)
- WSL (Windows Subsystem for Linux) for frontend builds

## 🛠️ Installation & Setup

### Step 1: Backend Setup

#### Option A: Docker (Recommended for Backend)

```bash
# Clone the repository
git clone https://github.com/grctest/g3n-fastapi-webcam-docker.git
cd g3n-fastapi-webcam-docker

# Build the Docker image
docker build -t gemma3n_webcam_app .

# Run the container
docker run -p 8080:8080 --gpus all gemma3n_webcam_app
```

#### Option B: Local Backend Installation

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

# Run the backend

`uvicorn app.main:app --host 0.0.0.0 --port 8080`

## 🚀 Using the Application

### Frontend Interface

1. **Open your browser** to `http://localhost:8080/`
2. **Allow webcam access** when prompted
3. **Select or create a persona** for AI analysis
4. **Either Capture Frame or Enable interval captures** to take a photo and get instant AI feedback
5. **View results** once the frame has been processed by Gemma 3n.

## 📖 API Documentation

The backend API documentation is available at `http://localhost:8080/docs` for advanced integration.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
