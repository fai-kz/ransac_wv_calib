import numpy as np
import matplotlib.pyplot as plt
import os
import random
from scipy.signal import find_peaks



def load_spectrum_data_txt(filename):
    l_f = filename
    if not os.path.isfile(l_f):
        print('Err: File not found')
        return None
    data = np.loadtxt(l_f,skiprows=1)
    print('---File stats:')
    print('size:',len(data))
    return np.array(data)



def normalize(data,l_min=None, l_max=None, x = True, y = True):
    if (l_min is None):
        l_min = data[0,0]
    if (l_max is None):
        l_max = data[-1,0]
    ##Normalization over wavelength:
    if x==True:
        data=data[(data[:,0]>=l_min) & (data[:,0]<=l_max)]
        data[:,0]=(data[:,0]-l_min)/(l_max-l_min)
    ##Normalization over intensity:
    if y==True:
        data[:,1]=data[:,1]/max(data[:,1])
    return data



tolerance = 1.0/1024.0       #, 1/1024
polyorder_k = 3
prominence = 0.01
def unique_random_sorted(N, L):
    # if N > L + 1:
    #     raise ValueError("N cannot be larger than the number of available integers (L+1).")
    numbers = random.sample(range(0, L+1), N)
    return sorted(numbers)

class peak_object:
    peak_id = 0
    peak_num = 0
    matched_peak_id = 0
    peak_type = 'reference'
    peak_pixel = 0
    peak_wv = 0
    maybe_wv = 0
    height = 0
    def __init__(self, peak_type:str, peak_id=0, peak_num = 0,peak_pixel=0, peak_wv = 0, height=0):
        self.peak_id = peak_id
        self.peak_num = peak_num
        self.peak_type = peak_type
        self.peak_pixel = peak_pixel
        self.peak_wv = peak_wv
        self.height = height

def random_selection(po_list, N=polyorder_k+1):
    selection_integers = []
    selection = random.sample(po_list, N)
    selection.sort(key=lambda p: p.peak_id)         # sort by peak_id attribute
    return  selection


def find_fit(po_list_ref, po_list_meas ,polyorder = polyorder_k):
    x1 = []
    for pref in po_list_ref:
        x1.append(pref.peak_wv)
    x2 = []
    for pimg in po_list_meas:
        x2.append(pimg.peak_pixel)
    ##
    x1=np.array(x1)
    x2=np.array(x2)
    coeffs = np.polyfit(x2, x1, polyorder)
    return coeffs



