from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, unique=True, index=True)
    upload_date = Column(String)

    embeddings = relationship("Embedding", back_populates="document", cascade="all, delete-orphan")

class Embedding(Base):
    __tablename__ = "embeddings"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    text_chunk = Column(Text)
    vector = Column(Vector(384))  # 384 dimensions for all-MiniLM-L6-v2

    document = relationship("Document", back_populates="embeddings")