import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import { API_URL } from '@env';

const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const [uploading, setUploading] = useState(false);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        uploadFile(file);
      }
    } catch (err) {
      console.log('Error picking document:', err);
    }
  };

  const uploadFile = async (file: any) => {
    setUploading(true);
    const formData = new FormData();
    
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || 'application/pdf',
    } as any);

    try {
      await axios.post(`${API_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout : 30000,
      });

      Alert.alert('Success', 'Memory added to your Brain!');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not upload file. Check server logs.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 p-6">
      <View className="mt-10 mb-8">
        <Text className="text-3xl font-bold text-gray-900">ReSource</Text>
        <Text className="text-gray-500 text-lg">Your Second Brain</Text>
      </View>

      <View className="flex-1 justify-center items-center">
        <TouchableOpacity 
          onPress={pickDocument}
          className="bg-blue-600 p-6 rounded-2xl shadow-lg w-full items-center mb-4"
        >
          <Text className="text-white font-bold text-lg">
            {uploading ? 'Reading Document...' : '+ Upload PDF'}
          </Text>
        </TouchableOpacity>

        {uploading && <ActivityIndicator size="large" color="#2563EB" />}

        <TouchableOpacity 
          onPress={() => navigation.navigate('Chat')}
          className="bg-white border-2 border-blue-600 p-6 rounded-2xl w-full items-center mt-4"
        >
          <Text className="text-blue-600 font-bold text-lg">Ask a Question</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default HomeScreen;