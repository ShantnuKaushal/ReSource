from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    stored_filename = Column(String, unique=True, index=True)
    file_path = Column(String, unique=True)
    upload_date = Column(String)

    embeddings = relationship("Embedding", back_populates="document", cascade="all, delete-orphan")
    conversation_links = relationship(
        "ConversationDocument",
        back_populates="document",
        cascade="all, delete-orphan",
    )

class Embedding(Base):
    __tablename__ = "embeddings"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    text_chunk = Column(Text)
    vector = Column(Vector(384))  # 384 dimensions for all-MiniLM-L6-v2

    document = relationship("Document", back_populates="embeddings")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    messages = relationship(
        "ChatMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ChatMessage.id",
    )
    active_documents = relationship(
        "ConversationDocument",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ConversationDocument.id",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False, index=True)
    sender = Column(String, nullable=False)
    text = Column(Text, nullable=False)
    citations = Column(Text, nullable=False, default="[]")
    created_at = Column(String, nullable=False)

    conversation = relationship("Conversation", back_populates="messages")


class ConversationDocument(Base):
    __tablename__ = "conversation_documents"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    created_at = Column(String, nullable=False)

    conversation = relationship("Conversation", back_populates="active_documents")
    document = relationship("Document", back_populates="conversation_links")
