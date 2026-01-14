import React, { useState } from 'react';

interface PhoneticEntry {
  letter: string;
  words: string[];
}

const phoneticAlphabets: Record<string, PhoneticEntry[]> = {
  usa: [
    { letter: 'A', words: ['Alpha', 'Apple', 'Able'] },
    { letter: 'B', words: ['Bravo', 'Baker', 'Boy'] },
    { letter: 'C', words: ['Charlie', 'Cat', 'Car'] },
    { letter: 'D', words: ['Delta', 'Dog', 'Day'] },
    { letter: 'E', words: ['Echo', 'Easy', 'Egg'] },
    { letter: 'F', words: ['Foxtrot', 'Fox', 'Fish'] },
    { letter: 'G', words: ['Golf', 'Girl', 'Game'] },
    { letter: 'H', words: ['Hotel', 'House', 'Hat'] },
    { letter: 'I', words: ['India', 'Ice', 'Ink'] },
    { letter: 'J', words: ['Juliet', 'Jump', 'Jam'] },
    { letter: 'K', words: ['Kilo', 'King', 'Key'] },
    { letter: 'L', words: ['Lima', 'Love', 'Lake'] },
    { letter: 'M', words: ['Mike', 'Moon', 'Man'] },
    { letter: 'N', words: ['November', 'Night', 'Nose'] },
    { letter: 'O', words: ['Oscar', 'Orange', 'Open'] },
    { letter: 'P', words: ['Papa', 'Park', 'Pen'] },
    { letter: 'Q', words: ['Quebec', 'Queen', 'Quick'] },
    { letter: 'R', words: ['Romeo', 'Red', 'Rain'] },
    { letter: 'S', words: ['Sierra', 'Sun', 'Star'] },
    { letter: 'T', words: ['Tango', 'Tree', 'Time'] },
    { letter: 'U', words: ['Uniform', 'Up', 'Use'] },
    { letter: 'V', words: ['Victor', 'Van', 'Vase'] },
    { letter: 'W', words: ['Whiskey', 'Water', 'Wind'] },
    { letter: 'X', words: ['X-ray', 'Box', 'Fix'] },
    { letter: 'Y', words: ['Yankee', 'Yes', 'Yellow'] },
    { letter: 'Z', words: ['Zulu', 'Zip', 'Zone'] },
  ],
  uk: [
    { letter: 'A', words: ['Apple', 'Able', 'Arm'] },
    { letter: 'B', words: ['Beer', 'Boy', 'Book'] },
    { letter: 'C', words: ['Charlie', 'Cat', 'Car'] },
    { letter: 'D', words: ['Don', 'Dog', 'Day'] },
    { letter: 'E', words: ['Edward', 'Egg', 'Ear'] },
    { letter: 'F', words: ['Freddie', 'Fish', 'Fox'] },
    { letter: 'G', words: ['George', 'Girl', 'Game'] },
    { letter: 'H', words: ['Harry', 'Hat', 'House'] },
    { letter: 'I', words: ['Ink', 'Ice', 'In'] },
    { letter: 'J', words: ['Johnnie', 'Jump', 'Jam'] },
    { letter: 'K', words: ['King', 'Key', 'Kit'] },
    { letter: 'L', words: ['London', 'Love', 'Lake'] },
    { letter: 'M', words: ['Monkey', 'Moon', 'Man'] },
    { letter: 'N', words: ['Nuts', 'Night', 'Nose'] },
    { letter: 'O', words: ['Orange', 'Open', 'Oak'] },
    { letter: 'P', words: ['Pip', 'Park', 'Pen'] },
    { letter: 'Q', words: ['Queen', 'Quick', 'Quiet'] },
    { letter: 'R', words: ['Robert', 'Red', 'Rain'] },
    { letter: 'S', words: ['Sugar', 'Sun', 'Star'] },
    { letter: 'T', words: ['Tommy', 'Tree', 'Time'] },
    { letter: 'U', words: ['Uncle', 'Up', 'Use'] },
    { letter: 'V', words: ['Vic', 'Van', 'Vase'] },
    { letter: 'W', words: ['William', 'Water', 'Wind'] },
    { letter: 'X', words: ['X-ray', 'Box', 'Fix'] },
    { letter: 'Y', words: ['Yellow', 'Yes', 'Year'] },
    { letter: 'Z', words: ['Zebra', 'Zip', 'Zone'] },
  ],
  nato: [
    { letter: 'A', words: ['Alfa', 'Apple', 'Able'] },
    { letter: 'B', words: ['Bravo', 'Baker', 'Boy'] },
    { letter: 'C', words: ['Charlie', 'Cat', 'Car'] },
    { letter: 'D', words: ['Delta', 'Dog', 'Day'] },
    { letter: 'E', words: ['Echo', 'Easy', 'Egg'] },
    { letter: 'F', words: ['Foxtrot', 'Fox', 'Fish'] },
    { letter: 'G', words: ['Golf', 'Girl', 'Game'] },
    { letter: 'H', words: ['Hotel', 'House', 'Hat'] },
    { letter: 'I', words: ['India', 'Ice', 'Ink'] },
    { letter: 'J', words: ['Juliett', 'Jump', 'Jam'] },
    { letter: 'K', words: ['Kilo', 'King', 'Key'] },
    { letter: 'L', words: ['Lima', 'Love', 'Lake'] },
    { letter: 'M', words: ['Mike', 'Moon', 'Man'] },
    { letter: 'N', words: ['November', 'Night', 'Nose'] },
    { letter: 'O', words: ['Oscar', 'Orange', 'Open'] },
    { letter: 'P', words: ['Papa', 'Park', 'Pen'] },
    { letter: 'Q', words: ['Quebec', 'Queen', 'Quick'] },
    { letter: 'R', words: ['Romeo', 'Red', 'Rain'] },
    { letter: 'S', words: ['Sierra', 'Sun', 'Star'] },
    { letter: 'T', words: ['Tango', 'Tree', 'Time'] },
    { letter: 'U', words: ['Uniform', 'Up', 'Use'] },
    { letter: 'V', words: ['Victor', 'Van', 'Vase'] },
    { letter: 'W', words: ['Whiskey', 'Water', 'Wind'] },
    { letter: 'X', words: ['X-ray', 'Box', 'Fix'] },
    { letter: 'Y', words: ['Yankee', 'Yes', 'Yellow'] },
    { letter: 'Z', words: ['Zulu', 'Zip', 'Zone'] },
  ],
  canada: [
    { letter: 'A', words: ['Alfa', 'Apple', 'Able'] },
    { letter: 'B', words: ['Bravo', 'Baker', 'Boy'] },
    { letter: 'C', words: ['Charlie', 'Cat', 'Car'] },
    { letter: 'D', words: ['Delta', 'Dog', 'Day'] },
    { letter: 'E', words: ['Echo', 'Easy', 'Egg'] },
    { letter: 'F', words: ['Foxtrot', 'Fox', 'Fish'] },
    { letter: 'G', words: ['Golf', 'Girl', 'Game'] },
    { letter: 'H', words: ['Hotel', 'House', 'Hat'] },
    { letter: 'I', words: ['India', 'Ice', 'Ink'] },
    { letter: 'J', words: ['Juliet', 'Jump', 'Jam'] },
    { letter: 'K', words: ['Kilo', 'King', 'Key'] },
    { letter: 'L', words: ['Lima', 'Love', 'Lake'] },
    { letter: 'M', words: ['Mike', 'Moon', 'Man'] },
    { letter: 'N', words: ['November', 'Night', 'Nose'] },
    { letter: 'O', words: ['Oscar', 'Orange', 'Open'] },
    { letter: 'P', words: ['Papa', 'Park', 'Pen'] },
    { letter: 'Q', words: ['Quebec', 'Queen', 'Quick'] },
    { letter: 'R', words: ['Romeo', 'Red', 'Rain'] },
    { letter: 'S', words: ['Sierra', 'Sun', 'Star'] },
    { letter: 'T', words: ['Tango', 'Tree', 'Time'] },
    { letter: 'U', words: ['Uniform', 'Up', 'Use'] },
    { letter: 'V', words: ['Victor', 'Van', 'Vase'] },
    { letter: 'W', words: ['Whiskey', 'Water', 'Wind'] },
    { letter: 'X', words: ['X-ray', 'Box', 'Fix'] },
    { letter: 'Y', words: ['Yankee', 'Yes', 'Yellow'] },
    { letter: 'Z', words: ['Zulu', 'Zip', 'Zone'] },
  ],
  australia: [
    { letter: 'A', words: ['Alpha', 'Apple', 'Able'] },
    { letter: 'B', words: ['Bravo', 'Baker', 'Boy'] },
    { letter: 'C', words: ['Charlie', 'Cat', 'Car'] },
    { letter: 'D', words: ['Delta', 'Dog', 'Day'] },
    { letter: 'E', words: ['Echo', 'Easy', 'Egg'] },
    { letter: 'F', words: ['Foxtrot', 'Fox', 'Fish'] },
    { letter: 'G', words: ['Golf', 'Girl', 'Game'] },
    { letter: 'H', words: ['Hotel', 'House', 'Hat'] },
    { letter: 'I', words: ['India', 'Ice', 'Ink'] },
    { letter: 'J', words: ['Juliet', 'Jump', 'Jam'] },
    { letter: 'K', words: ['Kilo', 'King', 'Key'] },
    { letter: 'L', words: ['Lima', 'Love', 'Lake'] },
    { letter: 'M', words: ['Mike', 'Moon', 'Man'] },
    { letter: 'N', words: ['November', 'Night', 'Nose'] },
    { letter: 'O', words: ['Oscar', 'Orange', 'Open'] },
    { letter: 'P', words: ['Papa', 'Park', 'Pen'] },
    { letter: 'Q', words: ['Quebec', 'Queen', 'Quick'] },
    { letter: 'R', words: ['Romeo', 'Red', 'Rain'] },
    { letter: 'S', words: ['Sierra', 'Sun', 'Star'] },
    { letter: 'T', words: ['Tango', 'Tree', 'Time'] },
    { letter: 'U', words: ['Uniform', 'Up', 'Use'] },
    { letter: 'V', words: ['Victor', 'Van', 'Vase'] },
    { letter: 'W', words: ['Whiskey', 'Water', 'Wind'] },
    { letter: 'X', words: ['X-ray', 'Box', 'Fix'] },
    { letter: 'Y', words: ['Yankee', 'Yes', 'Yellow'] },
    { letter: 'Z', words: ['Zulu', 'Zip', 'Zone'] },
  ],
};

const countryNames: Record<string, string> = {
  usa: 'USA',
  uk: 'UK',
  nato: 'NATO',
  canada: 'Canada',
  australia: 'Australia',
};

export const PhoneticAlphabet: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('usa');

  const currentAlphabet = phoneticAlphabets[activeTab] || phoneticAlphabets.usa;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 h-full flex flex-col min-w-0">
      <div className="mb-3 flex-shrink-0">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Phonetic Alphabet
        </h3>
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-3">
          {Object.keys(phoneticAlphabets).map((key) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === key
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {countryNames[key]}
            </button>
          ))}
        </div>
      </div>

      {/* Alphabet Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto flex-1 min-h-0">
        {currentAlphabet.map((entry) => (
          <div
            key={entry.letter}
            className="bg-slate-50 dark:bg-slate-700/50 rounded p-2 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-3"
          >
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex-shrink-0">
              {entry.letter}
            </div>
            <div className="space-y-0.5 flex-1">
              {entry.words.map((word, index) => (
                <div
                  key={index}
                  className="text-xs text-slate-600 dark:text-slate-400 font-medium"
                >
                  {word}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
