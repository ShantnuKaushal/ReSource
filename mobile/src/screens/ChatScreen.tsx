import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import axios from 'axios';
import { API_URL } from '@env';

type Message = {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  citations?: string[];
};

const ChatScreen = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), text: inputText, sender: 'user' };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/chat`, {
        question: userMsg.text,
      });

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: response.data.answer,
        sender: 'ai',
        citations: response.data.citations
      };
      
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      console.error(error);
      const errorMsg: Message = { id: Date.now().toString(), text: "Sorry, I couldn't reach the brain.", sender: 'ai' };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: Message }) => (
    <View className={`my-2 p-4 rounded-xl max-w-[80%] ${item.sender === 'user' ? 'bg-blue-600 self-end' : 'bg-gray-200 self-start'}`}>
      <Text className={item.sender === 'user' ? 'text-white' : 'text-black'}>{item.text}</Text>
      
      {item.citations && item.citations.length > 0 && (
        <View className="mt-2 pt-2 border-t border-gray-300">
          <Text className="text-xs font-bold text-gray-500">Sources:</Text>
          {item.citations.map((cite, index) => (
            <Text key={index} className="text-xs text-gray-500 italic">• {cite}</Text>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <FlatList
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20 }}
      />
      
      {loading && <ActivityIndicator className="mb-4" size="small" color="#2563EB" />}

      <View className="p-4 border-t border-gray-100 flex-row items-center">
        <TextInput
          className="flex-1 bg-gray-100 p-4 rounded-full mr-2"
          placeholder="Ask your documents..."
          value={inputText}
          onChangeText={setInputText}
        />
        <TouchableOpacity onPress={sendMessage} className="bg-blue-600 p-4 rounded-full">
          <Text className="text-white font-bold">Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

export default ChatScreen;