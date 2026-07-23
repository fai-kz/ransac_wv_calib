import numpy as np
import matplotlib.pyplot as plt
import os
from scipy.signal import find_peaks


def dtw_distance(a, b):
    """
    Compute DTW cost between two sequences using NumPy.
    a, b: Arrays of neighbor distances (e.g., peak.reading)
    Returns: DTW cost (lower is better)
    """
    n, m = len(a), len(b)
    dtw = np.zeros((n + 1, m + 1))
    dtw[0, :] = np.inf
    dtw[:, 0] = np.inf
    dtw[0, 0] = 0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = abs(a[i - 1] - b[j - 1])
            dtw[i, j] = cost + min(
                dtw[i - 1, j],    # Insert
                dtw[i, j - 1],    # Delete
                dtw[i - 1, j - 1] # Match
            )
    return dtw[n, m]

def _overlap_ratio(win1, win2):
    x1_min, x1_max = win1[:,0].min(), win1[:,0].max()
    x2_min, x2_max = win2[:,0].min(), win2[:,0].max()
    overlap = max(0, min(x1_max, x2_max) - max(x1_min, x2_min))
    union = max(x1_max, x2_max) - min(x1_min, x2_min)
    return overlap / union

class peak:
    def __init__(self,index, position):
        self.sigma= 1
        self.index = index
        self.position = position
        ##This indexation works as followng:
        ##index and position show index in data arra
        self.matched_pos = 0
        self.matched_index = 0
        self.occupied=False
        # print('object created:',self.index, self.position)
        self.local_window = None



    def calculate_distance_to_neighbours(self, peaks, N=-1):
        distances = []
        if N==-1:
            N=len(peaks)
        for i in range(len(peaks)):
            if self.index != peaks[i].index:
                dist = peaks[i].position - self.position #+ random.uniform(-0.01,0.01)
                # if random.uniform(0,1)>0.01:
                distances.append((dist, peaks[i].index))  # Use global index

        # Sort by absolute distance
        distances.sort(key=lambda d: abs(d[0]))
        self.reading = [d[0] for d in distances[:N]]
        self.neighbour_indexes = [d[1] for d in distances[:N]]

    def similarity_check(self, ideal_peaks, criteria_type='probabilistic'):
        self.weights = np.zeros(len(ideal_peaks))
        self.indexes_ideal=np.zeros(len(ideal_peaks))
        self.pos_ideal = np.zeros(len(ideal_peaks))
        for i in range(len(ideal_peaks)):
            a = np.array(self.reading)
            b = np.array(ideal_peaks[i].reading)
            self.indexes_ideal[i]  = int(ideal_peaks[i].index)
            # self.indexes_ideal[i]=i
            if criteria_type == 'probabilistic':
                squared_error = np.sum((a - b) ** 2)
                weight = np.exp(-squared_error / (2 * self.sigma ** 2))
            else:
                raise ValueError(f"Unknown criteria_type: {criteria_type}")
            self.weights[i] = weight
            self.pos_ideal[i]=ideal_peaks[i].position
        self.weights/=np.sum(self.weights)
        average = np.average(self.weights)
        self.matched_index = int(self.indexes_ideal[self.weights==max(self.weights)])
    def similarity_check_dtw(self, ideal_peaks):
        self.dtw_costs = np.zeros(len(ideal_peaks))
        self.indexes_ideal = np.zeros(len(ideal_peaks))
        self.pos_ideal = np.zeros(len(ideal_peaks))
        for i in range(len(ideal_peaks)):
            a = np.array(self.reading)
            b = np.array(ideal_peaks[i].reading)
            self.indexes_ideal[i] = int(ideal_peaks[i].index)
            self.dtw_costs[i] = dtw_distance(a, b) if len(a) > 0 and len(b) > 0 else np.inf
            self.pos_ideal[i] = ideal_peaks[i].position
    def normalize_local_window(self,x = True, y = True):
        if None:
            return
        x_min = min(self.local_window[:,0])
        x_max = max(self.local_window[:,0])
        self.local_window_norm = (self.local_window[:,0]-x_min)/(x_max-x_min)
    def compare_to(self, P_arc, similarity_type='inverse', sigma=1.0):
        if len(P_arc) < 2:
            print(f'Critical! Not enough peaks to compare for {self.index}')
            return
        best_score = float('inf')
        best_match = None
        for p in P_arc:
            # if self.local_y_norm is None or p.local_y_norm is None:
            #     continue
            # if len(self.local_y_norm) < 5 or len(p.local_y_norm) < 5:
            #     continue
            dtw_dist = dtw_distance(self.local_window[:,1], p.local_window[:,1])
            if dtw_dist < best_score and np.abs(self.position - p.position)<0.05:
                best_score = dtw_dist
                best_match = p

        if best_match is not None:
            self.matched_index = best_match.index
            self.matched_pos = best_match.position
            self.dtw_distance = best_score

            # Convert to similarity score
            if similarity_type == 'inverse':
                self.match_score = 1 / (1 + best_score)
            elif similarity_type == 'gaussian':
                self.match_score = np.exp(- (best_score ** 2) / (2 * sigma ** 2))
            else:
                raise ValueError("Unknown similarity_type")
        else:
            self.matched_index = -1
            self.matched_pos = -1
            self.dtw_distance = np.inf
            self.match_score = 0.0
