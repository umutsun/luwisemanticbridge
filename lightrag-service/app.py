
import os
import asyncio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import gpt_4o_mini_complete, openai_embed

# Load environment variables from .env file
load_dotenv()

# Check if the OpenAI API key is set
if not os.getenv("OPENAI_API_KEY"):
    raise RuntimeError("OPENAI_API_KEY environment variable not set. Please create a .env file and add it.")

app = FastAPI(
    title="LightRAG Service",
    description="A microservice to interact with a LightRAG instance.",
    version="1.0.0"
)

# Initialize LightRAG
# We are using gpt-4o-mini for completion and the default openai model for embeddings
rag = LightRAG(
    llm_model_func=gpt_4o_mini_complete,
    embedding_func=openai_embed
)

# In-memory storage for indexed status
is_indexed = False

class IndexRequest(BaseModel):
    text: str

class QueryRequest(BaseModel):
    query: str
    mode: str = "hybrid" # Options: "local", "global", "hybrid"

@app.on_event("startup")
async def startup_event():
    # In a real application, you might load and index a default dataset here.
    # For this example, we will index some sample text on first query if not already indexed.
    global is_indexed
    sample_text = """
    Luwi Semantic Bridge (ASB) is an AI-powered semantic search and knowledge management system.
    It uses Retrieval-Augmented Generation (RAG) to provide contextually aware answers from a knowledge base.
    The system is composed of a Node.js backend, a Next.js dashboard, and various AI microservices.
    LightRAG is being integrated to enhance its knowledge graph capabilities.
    """
    print("Indexing sample data...")
    rag.index(sample_text)
    is_indexed = True
    print("Sample data indexed.")


@app.post("/index")
async def index_data(request: IndexRequest):
    """
    Indexes the provided text into the LightRAG knowledge graph.
    """
    try:
        rag.index(request.text)
        global is_indexed
        is_indexed = True
        return {"message": "Text indexed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/query")
async def query_rag(request: QueryRequest):
    """
    Performs a query against the indexed data using LightRAG.
    """
    global is_indexed
    if not is_indexed:
        raise HTTPException(status_code=400, detail="No data has been indexed yet. Please call the /index endpoint first.")

    try:
        query_param = QueryParam(mode=request.mode)
        # Use asyncio.run() for the async aquery method in a sync function if needed,
        # but since this is an async def, we can just await it.
        response = await rag.aquery(request.query, param=query_param)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_root():
    return {"message": "LightRAG Service is running. Use the /query endpoint to interact with the RAG."}

# To run this server:
# 1. Make sure you have a .env file with your OPENAI_API_KEY.
# 2. Install dependencies: pip install -r requirements.txt
# 3. Run with uvicorn: uvicorn app:app --reload --port 8001
