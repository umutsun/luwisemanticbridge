
# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
# Also install uvicorn and fastapi as they are needed for the web server
# Use --no-cache-dir to save space and --break-system-packages for slim image
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt
RUN pip install --no-cache-dir --break-system-packages "uvicorn[standard]" fastapi pydantic

# Copy the rest of the application's code into the container at /app
COPY . .

# Make port 8002 available to the world outside this container
EXPOSE 8002

# Define environment variable
ENV NAME RAG-anything

# Run main.py when the container launches
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
