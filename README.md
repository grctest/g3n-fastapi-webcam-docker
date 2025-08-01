# Gemma 3n FastAPI Webcam Docker Orchestrator

A FastAPI-based orchestrator for managing Google Gemma 3n model instances with webcam integration. This system enables image analysis using AI agents for real-time computer vision applications.

## 🚀 Features

- **Instance Management**: Initialize and manage Gemma 3n model instances
- **Webcam Integration**: Real-time camera capture and analysis
- **Serial Processing**: Reliable single-instance operations
- **Resource Monitoring**: Track memory usage, GPU utilization, and system status
- **REST API**: Complete FastAPI interface with interactive documentation
- **Docker Support**: Containerized deployment with all dependencies
- **4-bit Quantization**: Memory-efficient model loading with BitsAndBytesConfig

## 🏗️ Architecture

### Core Components

- **GemmaManager**: Central orchestrator for model instances
- **GemmaInstance**: Individual model wrapper with thread-safe operations
- **Webcam Integration**: OpenCV-based camera capture and processing
- **Serial Processing**: Reliable single-request handling

### Key Capabilities

1. **Instance Management**
   - Initialize single Gemma instances
   - Configure device placement (CPU/CUDA/Auto)
   - Custom system prompts and generation parameters
   - Graceful shutdown and resource cleanup

2. **Image Analysis**
   - Upload and analyze image files
   - Real-time webcam capture and analysis
   - Base64 image encoding/decoding

3. **System Monitoring**
   - Real-time instance status tracking
   - Memory and GPU usage monitoring
   - Health check endpoints
   - Comprehensive system status reports

## 📋 Requirements

- Python 3.11+
- CUDA-compatible GPU (optional, but recommended)
- Webcam/Camera device
- 8GB+ RAM (depending on model size and instances)

## 🛠️ Installation

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/grctest/g3n-fastapi-webcam-docker.git
cd g3n-fastapi-webcam-docker

# Build the Docker image
docker build -t gemma-webcam-orchestrator .

# Run the container
docker run -p 8080:8080 --gpus all --device /dev/video0 gemma-webcam-orchestrator
```

### Option 2: Local Installation

```bash
# Clone the repository
git clone https://github.com/grctest/g3n-fastapi-webcam-docker.git
cd g3n-fastapi-webcam-docker

# Prep the environment
conda create -n g3n
conda activate g3n

# Install dependencies
pip install -r requirements.txt

# Run the application
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## 🚀 Quick Start

### 1. Initialize a Gemma Instance

```bash
curl -X POST "http://localhost:8080/initialize-gemma-instance" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "analyzer-1",
    "system_prompt": "You are an expert image analyst.",
    "load_in_4bit": true
  }'
```

### 2. Quick Webcam Analysis

```bash
curl "http://localhost:8080/quick-webcam-analysis/analyzer-1?prompt=Describe what you see"
```

### 3. Upload and Analyze Image

```bash
curl -X POST "http://localhost:8080/upload-and-analyze" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@image.jpg" \
  -F "instance_id=analyzer-1" \
  -F "prompt=Describe this image"
```

## 📖 API Documentation

Once running, visit `http://localhost:8080/docs` for the interactive API documentation.

### Key Endpoints

- `POST /initialize-gemma-instance` - Initialize a single instance
- `POST /chat` - Chat with an instance
- `POST /analyze-image` - Analyze a base64-encoded image
- `POST /upload-and-analyze` - Upload and analyze an image file
- `POST /analyze-webcam` - Capture and analyze webcam image
- `GET /quick-webcam-analysis/{instance_id}` - Quick webcam analysis
- `GET /instance-status/{instance_id}` - Get instance status
- `POST /shutdown-instance/{instance_id}` - Shutdown single instance
- `POST /shutdown-all-instances` - Shutdown all instances
- `GET /system-status` - Get system status
- `GET /health` - Health check

## 🔧 Configuration

### Instance Configuration

```python
{
  "instance_id": "unique-id",
  "model_name": "google/gemma-3n-E2B-it",
  "device": "auto",  # "cpu", "cuda", or "auto"
  "max_length": 512,
  "temperature": 0.8,
  "system_prompt": "Your custom prompt here",
  "load_in_4bit": true
}
```

### Webcam Configuration

```python
{
  "camera_index": 0,
  "image_width": 640,
  "image_height": 480,
  "capture_interval": 1.0
}
```

## 🎯 Use Cases

### 1. Security Monitoring
Deploy instances with focused analysis:
- General scene description
- Person detection
- Anomaly detection
- Safety compliance checking

### 2. Quality Control
Single-instance analysis for:
- Product defect detection
- Compliance verification
- Measurement validation
- Documentation generation

### 3. Content Creation
Image analysis:
- Scene composition feedback
- Technical quality assessment
- Creative suggestions
- Automated tagging

## 🔧 Advanced Features

### Memory Management
- Automatic memory usage tracking
- GPU memory optimization
- 4-bit quantization support
- Resource cleanup on shutdown

### Concurrent Processing
- Thread-safe instance management
- Serial request handling for reliability
- Async/await throughout

### Error Handling
- Comprehensive error responses
- Instance health monitoring
- Graceful failure recovery
- Detailed logging

## 📊 Performance

### Typical Performance (RTX 4090, 32GB RAM)
- Instance initialization: 10-30 seconds
- Image analysis: 1-5 seconds per instance
- Concurrent instances: 4-8 (depending on settings)
- Memory per instance: 2-4GB

### Optimization Tips
- Use 4-bit quantization for memory efficiency
- Limit concurrent instances based on available VRAM
- Use CPU instances for lower priority tasks
- Monitor system status regularly

## 🛡️ Security Considerations

- Input validation for all endpoints
- Resource usage monitoring
- Secure file upload handling
- Rate limiting recommended for production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Google for the Gemma model architecture
- Hugging Face for the transformers library
- FastAPI for the excellent web framework
- OpenCV for computer vision capabilities

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check the API documentation at `/docs`
- Review the system status at `/system-status`

This project provides a robust REST API built with FastAPI and Docker to interact with Gemma 3n.

## Technology Stack

*   [FastAPI](https://github.com/fastapi/fastapi) for the core web framework.
*   [Uvicorn](https://www.uvicorn.org/) as the ASGI server.
*   [Docker](https://www.docker.com/) for containerization and easy deployment.
*   [Pydantic](https://docs.pydantic.dev/) for data validation and settings management.

---

## Getting Started

### Prerequisites

*   [Docker Desktop](https://www.docker.com/products/docker-desktop/)
*   [Conda](https://www.anaconda.com/download) (or another Python environment manager)
*   Python 3.10+

### 1. Set Up the Python Environment

Create and activate a Conda environment:
```bash
conda create -n g3n python=3.11
conda activate g3n
```

Install the Huggingface-CLI tool to download the models:
```
pip install -U "huggingface_hub[cli]"
```
 
Download Google's Gemma 3n instruction-tuned model:
```bash
huggingface-cli download google/gemma-3n-E2B-it --local-dir app/models/google/gemma-3n-E2B-it
```

---

## Running the Application

### Using Docker (Recommended)

This is the easiest and recommended way to run the application.

1.  **Build the Docker image:**
    ```bash
        docker build -t fastapi-gemma3n .
```

2.  **Run the container** (with GPU support if available):
```bash
    docker run -d --name gemma3n-container -p 8080:8080 fastapi-gemma3n
    ```

2.  **Run the Docker container:**
    This command runs the container in detached mode (`-d`) and maps port 8080 on your host to port 8080 in the container.
    ```bash
    docker run -d --name ai_container -p 8080:8080 fastapi_bitnet
    ```

### Local Development

For development, you can run the application directly with Uvicorn, which enables auto-reloading.

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

---

## API Usage

Once the server is running, you can access the interactive API documentation:

*   **Swagger UI**: [http://127.0.0.1:8080/docs](http://127.0.0.1:8080/docs)
*   **ReDoc**: [http://127.0.0.1:8080/redoc](http://127.0.0.1:8080/redoc)

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
